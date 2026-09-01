const customerRepository = require("../repo/customer.repo");
const invoiceRepository = require("../repo/invoice.repo");
const transactionRepo = require("../repo/transaction.repo");
const entityRepository = require("../repo/entity.repo");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const { toCsv } = require("../utils/csv.util");
const { buildStatementHtml } = require("../utils/templates/statementTemplate");
const { htmlToPdfBuffer } = require("../utils/templates/pdf");

class CustomerService {
  // Used by the "pick an existing customer" step of invoice creation, and by
  // a standalone customers list in the dashboard.
  static getAllCustomers = async (entity_id) => {
    return customerRepository.findAll({
      query: { entity: entity_id },
      sort: { name: 1 },
    });
  };

  // Every customer as a CSV string - for a business's own records, or to
  // hand off to whatever CRM/spreadsheet they already keep customers in
  // outside invoecr.
  static exportCustomersCsv = async (entity_id) => {
    const customers = await customerRepository.findAll({
      query: { entity: entity_id },
      sort: { name: 1 },
    });
    return toCsv(customers, [
      { header: "Name", key: "name" },
      { header: "Email", key: "email" },
      { header: "Phone", key: "phone" },
      { header: "Company", key: "companyName" },
      { header: "Address", key: "address" },
      { header: "Customer Code", key: "code" },
    ]);
  };

  // A single customer's own detail view - not exposed as a route yet
  // elsewhere in this app (customers only ever appeared inside invoice
  // records before), so this is also what backs the new customer detail
  // page's header.
  static getCustomerByCode = async (code, entity_id) => {
    const customer = await customerRepository.findOne({ query: { code, entity: entity_id } });
    abortIf(!customer, httpStatus.NOT_FOUND, "Customer not found");
    return customer;
  };

  // A running ledger for one customer: every real (non-draft) invoice as a
  // charge, every successful payment as a credit, merged into one
  // chronological list with a running balance - the "who owes what, from
  // what" view a business needs when a customer has several invoices open
  // at once, or asks "what do I still owe you in total?".
  static getCustomerStatement = async (code, entity_id) => {
    const customer = await customerRepository.findOne({ query: { code, entity: entity_id } });
    abortIf(!customer, httpStatus.NOT_FOUND, "Customer not found");

    const [invoices, transactions] = await Promise.all([
      invoiceRepository.findAll({
        query: { customer: customer._id, entity: entity_id, status: { $ne: "draft" } },
        select: "invoiceNumber issueDate total currency status",
        sort: { issueDate: 1 },
      }),
      transactionRepo.findAll({
        query: { customer: customer._id, entity: entity_id, status: "SUCCESS" },
        select: "amount createdAt reference channel method",
        sort: { createdAt: 1 },
      }),
    ]);

    const entries = [
      ...invoices.map((inv) => ({
        date: inv.issueDate,
        type: "invoice",
        label: `Invoice ${inv.invoiceNumber}`,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(inv.total || 0),
      })),
      ...transactions.map((txn) => ({
        date: txn.createdAt,
        type: "payment",
        label: txn.reference ? `Payment - ${txn.reference}` : "Payment",
        invoiceNumber: null,
        // Negative here so a single running-balance reduce (below) can
        // just sum amounts - invoices add to the balance owed, payments
        // subtract from it.
        amount: -Number(txn.amount || 0),
      })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = 0;
    const ledger = entries.map((entry) => {
      runningBalance += entry.amount;
      return { ...entry, balance: runningBalance };
    });

    const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.total || 0), 0);
    const totalPaid = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);

    return {
      customer: { name: customer.name, email: customer.email, phone: customer.phone, code: customer.code },
      ledger,
      totalInvoiced,
      totalPaid,
      balanceDue: Math.max(totalInvoiced - totalPaid, 0),
      // Same representative-currency simplification as
      // ReportingService.getOverview - see its comment for why.
      currency: invoices[0]?.currency || "NGN",
    };
  };

  // Same statement, rendered as a branded PDF a business can send straight
  // to the customer.
  static downloadCustomerStatement = async (code, entity_id) => {
    const statement = await CustomerService.getCustomerStatement(code, entity_id);
    const entity = await entityRepository.findById(entity_id);
    const html = buildStatementHtml({
      ...statement,
      businessName: entity?.name || "",
      businessAddress: entity?.address || "",
      logoPath: entity?.logo || "",
    });
    const pdfBuffer = await htmlToPdfBuffer(html);
    return { pdfBuffer, customerName: statement.customer.name };
  };
}

module.exports = {
  CustomerService,
};
