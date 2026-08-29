const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const quoteRepository = require("../repo/quote.repo");
const customerRepository = require("../repo/customer.repo");
const entityRepository = require("../repo/entity.repo");
const bankRepo = require("../repo/bankAccount.repo");
const getPagination = require("../utils/pagination");
const { generateInvoice } = require("../utils/invoice");
const { sendEmail } = require("../utils/email.util");
const { getPlan } = require("../config/plans");
const { buildEmailHtml, esc } = require("../utils/templates/emailLayout");
const { money } = require("../utils/templates/money");

class QuoteService {
  // Shared shape-building for the PDF renderer - mirrors
  // InvoiceService._pdfDataFor, but labeled as a proforma/quote document and
  // with no payment link or bank details (a quote isn't payable - only a
  // converted invoice is), and its "due" meta-row repurposed for the
  // quote's expiry instead of a payment due date.
  static _pdfDataFor = async (quote, entity_id) => {
    const entity = await entityRepository.findById(entity_id);
    return {
      ...quote.toJSON(),
      invoiceNumber: quote.quoteNumber,
      dueDate: quote.expiryDate,
      template: entity?.invoiceTemplate,
      businessName: entity?.name || "",
      businessAddress: entity?.address || "",
      businessPhone: entity?.phone || "",
      logoPath: entity?.logo || "",
      signaturePath: entity?.signature || "",
      documentLabel: "Proforma Invoice",
      dueDateLabel: "Valid until",
      vatRate: quote.subtotal ? (quote.tax / quote.subtotal) * 100 : 0,
      // Deliberately no `paymentLink`/`bank` - buildPaymentDetails() already
      // no-ops when both are absent, so the rendered PDF just has no
      // payment section, which is correct for a not-yet-committed quote.
    };
  };

  static createQuote = async (data, entity_id) => {
    const owningEntity = await entityRepository.findById(entity_id);
    abortIf(!owningEntity, httpStatus.BAD_REQUEST, "Invalid Entity Id");
    abortIf(
      !getPlan(owningEntity.plan).allowQuotes,
      httpStatus.FORBIDDEN,
      "Proforma invoices & quotes are a Growth-plan feature. Upgrade your plan to create one."
    );

    let customer;
    abortIf(
      !data.customer && !data.customerId,
      httpStatus.BAD_REQUEST,
      "Customer is required"
    );
    if (data.customerId) {
      customer = await customerRepository.findOne({ query: { _id: data.customerId } });
      abortIf(!customer, httpStatus.NOT_FOUND, "Customer not found");
    } else if (data.customer) {
      customer = await customerRepository.create({ ...data.customer, entity: entity_id });
      abortIf(!customer, httpStatus.BAD_REQUEST, "Error creating customer");
    }
    const { customer: _c, customerId: _cid, ...rest } = data;

    // Unlike InvoiceService.createInvoice, a quote's inventory-linked items
    // are NOT reserved/deducted here - quoting a price shouldn't hold stock
    // hostage against a sale that may never happen. Stock is only touched
    // once (if) this quote is actually converted to an invoice. So items
    // pass through as-is: `inventoryItemId` (if present) is kept on the line
    // so convertToInvoice can re-run it through the real reservation path,
    // but name/unitPrice are taken as given here (a light best-effort
    // lookup, not the authoritative stock-aware resolution InvoiceService
    // does) so the quote PDF shows sensible figures even before conversion.
    const items = await QuoteService._hydrateItemsFromInventory(rest.items || [], entity_id);

    const quote = await quoteRepository.create({
      ...rest,
      items,
      customer: customer._id,
      entity: entity_id,
      status: "draft",
    });
    abortIf(!quote, httpStatus.BAD_REQUEST, "Error creating quote");

    // Best-effort: email the quote to the customer, same non-blocking
    // pattern as invoice creation.
    if (customer.email) {
      QuoteService._pdfDataFor(quote, entity_id)
        .then((pdfData) => generateInvoice(pdfData))
        .then((pdfBuffer) =>
          sendEmail({
            to: customer.email,
            subject: `Quote ${quote.quoteNumber}`,
            html: buildEmailHtml({
              preheader: `New quote ${quote.quoteNumber} for ${money(quote.total, quote.currency)}.`,
              heading: `New quote from your supplier`,
              bodyHtml: `<p style="margin:0;">Hi ${esc(customer.name || "there")}, you have a new quote <strong>${esc(quote.quoteNumber)}</strong> for <strong>${money(quote.total, quote.currency)}</strong>.</p>`,
              cta: { label: "View quote", url: `${process.env.APP_URL || ""}/quote/${quote.quoteNumber}` },
            }),
            attachments: [
              { filename: `quote_${quote.quoteNumber}.pdf`, content: pdfBuffer },
            ],
          })
        )
        .catch((error) => console.error("Failed to email quote:", error.message));
    }

    return quote;
  };

  // Fills in name/unitPrice/description from the inventory catalog for any
  // inventoryItemId-linked line, WITHOUT touching stock - a lighter cousin
  // of InventoryService.reserveStockForItems for use at quote time, where no
  // commitment has been made yet. Uses require() inline to avoid a circular
  // import (inventory.service.js doesn't need to know about quotes).
  static _hydrateItemsFromInventory = async (items, entity_id) => {
    const linked = (items || []).filter((i) => i.inventoryItemId);
    if (!linked.length) return items;
    const inventoryRepo = require("../repo/inventoryItem.repo");
    const ids = linked.map((i) => i.inventoryItemId);
    const byId = new Map(
      (await inventoryRepo.findAll({ query: { _id: { $in: ids }, entity: entity_id } })).map(
        (i) => [String(i._id), i]
      )
    );
    return items.map((line) => {
      if (!line.inventoryItemId) return line;
      const inv = byId.get(String(line.inventoryItemId));
      abortIf(!inv, httpStatus.NOT_FOUND, "Inventory item not found");
      return {
        ...line,
        inventoryItem: inv._id,
        name: line.name || inv.name,
        description: line.description || inv.description || "",
        unitPrice: inv.unitPrice,
      };
    });
  };

  static getAllQuotes = async (entity_id, filters = {}) => {
    const { status, search, page = 1, perPage = 10 } = filters;
    const query = { entity: entity_id };
    if (status) query.status = { $in: status.split(",") };
    if (search) query.quoteNumber = { $regex: search, $options: "i" };
    const { skip, limit } = getPagination(page, perPage);
    const [quotes, total] = await Promise.all([
      quoteRepository.model
        .find(query)
        .populate("customer", "name email code")
        .sort({ issueDate: -1 })
        .skip(skip)
        .limit(limit),
      quoteRepository.countDocuments(query),
    ]);
    return {
      quotes,
      pagination: {
        total,
        page: Number(page),
        perPage: Number(perPage),
        totalPages: Math.ceil(total / limit),
        hasNextPage: Number(page) < Math.ceil(total / limit),
        hasPrevPage: Number(page) > 1,
      },
    };
  };

  static getQuoteById = async (code, entity_id) => {
    const quote = await quoteRepository.findOne({
      query: { quoteNumber: code, entity: entity_id },
      populate: [
        { path: "customer", select: "name email phone" },
        { path: "entity" },
        // So the frontend can link straight to "View the invoice" once
        // converted - invoiceNumber is the routable code, not the raw _id.
        { path: "convertedInvoice", select: "invoiceNumber" },
      ],
    });
    abortIf(!quote, httpStatus.NOT_FOUND, "Quote not found");
    return quote;
  };

  // Public, unauthenticated view - what the link emailed to the customer
  // resolves to, same "unguessable token" pattern as
  // InvoiceService.getPublicInvoice.
  static getPublicQuote = async (code) => {
    const quote = await quoteRepository.findOne({
      query: { quoteNumber: code },
      populate: [
        { path: "customer", select: "name email" },
        { path: "entity", select: "name logo address" },
      ],
    });
    abortIf(!quote, httpStatus.NOT_FOUND, "Quote not found");
    return quote;
  };

  // The customer's own accept/reject action from the public quote page - no
  // business auth involved, gated only by already knowing the quote's
  // unguessable code. Only meaningful from 'sent' (or 'draft', for a
  // business that skipped formally "sending" it) - once accepted/rejected/
  // converted, it's a done deal.
  static respondToQuote = async (code, response) => {
    const quote = await quoteRepository.findOne({ query: { quoteNumber: code } });
    abortIf(!quote, httpStatus.NOT_FOUND, "Quote not found");
    abortIf(
      !["draft", "sent"].includes(quote.status),
      httpStatus.BAD_REQUEST,
      `This quote has already been ${quote.status} and can no longer be responded to`
    );
    const updated = await quoteRepository.update(quote._id, { status: response });
    return updated;
  };

  static downloadQuoteById = async (code, entity_id) => {
    const quote = await QuoteService.getQuoteById(code, entity_id);
    const pdfData = await QuoteService._pdfDataFor(quote, entity_id);
    const pdfBuffer = await generateInvoice(pdfData);
    return { pdfBuffer, quoteNumber: quote.quoteNumber };
  };

  static updateQuote = async (code, data, entity_id) => {
    const existing = await quoteRepository.findOne({ query: { quoteNumber: code, entity: entity_id } });
    abortIf(!existing, httpStatus.NOT_FOUND, "Quote not found");
    abortIf(
      existing.status === "converted",
      httpStatus.BAD_REQUEST,
      "This quote has already been converted to an invoice and can no longer be edited"
    );
    let updateData = data;
    if (data.items) {
      updateData = { ...data, items: await QuoteService._hydrateItemsFromInventory(data.items, entity_id) };
    }
    const quote = await quoteRepository.update(existing._id, updateData);
    abortIf(!quote, httpStatus.NOT_FOUND, "Quote not found");
    return quote;
  };

  static deleteQuote = async (code, entity_id) => {
    const existing = await quoteRepository.findOne({ query: { quoteNumber: code, entity: entity_id } });
    abortIf(!existing, httpStatus.NOT_FOUND, "Quote not found");
    const quote = await quoteRepository.delete(existing._id);
    abortIf(!quote, httpStatus.NOT_FOUND, "Quote not found");
    return quote;
  };

  // The actual "let's do that" feature: turns an accepted (or any
  // not-yet-converted) quote into a real Invoice. Deliberately delegates to
  // InvoiceService.createInvoice rather than duplicating its logic, so
  // conversion gets exactly the same plan-limit enforcement, inventory stock
  // reservation/rollback, and customer-email-on-creation behavior as
  // creating an invoice by hand. Inline require avoids a circular import at
  // module-load time (invoice.service.js doesn't import quote.service.js).
  static convertToInvoice = async (code, entity_id) => {
    const { InvoiceService } = require("./invoice.service");
    const quote = await quoteRepository.findOne({ query: { quoteNumber: code, entity: entity_id } });
    abortIf(!quote, httpStatus.NOT_FOUND, "Quote not found");
    abortIf(
      quote.status === "converted",
      httpStatus.BAD_REQUEST,
      "This quote has already been converted to an invoice"
    );

    const invoicePayload = {
      customerId: String(quote.customer),
      currency: quote.currency,
      issueDate: new Date(),
      notes: quote.notes,
      terms: quote.terms,
      tax: quote.tax,
      items: (quote.items || []).map((item) => ({
        inventoryItemId: item.inventoryItem ? String(item.inventoryItem) : undefined,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    };

    // Runs the item set through InventoryService.reserveStockForItems (via
    // createInvoice) for real, for the first time - stock was deliberately
    // NOT touched at quote-creation time (see createQuote above), so this is
    // where a since-depleted inventory item would correctly reject
    // conversion rather than silently overselling.
    const invoice = await InvoiceService.createInvoice(invoicePayload, entity_id);

    await quoteRepository.update(quote._id, {
      status: "converted",
      convertedInvoice: invoice._id,
    });

    return invoice;
  };
}

module.exports = {
  QuoteService,
};
