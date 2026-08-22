const Invoice = require("../models/invoice.model");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const invoiceRepository = require("../repo/invoice.repo");
const customerRepository = require("../repo/customer.repo");
const entityRepository = require("../repo/entity.repo");
const getPagination = require("../utils/pagination");
const { default: mongoose } = require("mongoose");
const { generateInvoice } = require("../utils/invoice");
const { PaystackPaymentGateway } = require("../utils/paystack.utils");
const transactionRepo = require("../repo/transaction.repo");
const bankRepo = require("../repo/bankAccount.repo");
const { sendEmail } = require("../utils/email.util");
const crypto = require("crypto");
const { getPlan } = require("../config/plans");
const { ReminderService } = require("./reminder.service");
const { FirsService } = require("./firs.service");
const { InventoryService } = require("./inventory.service");

class InvoiceService {
  // Shared shape-building for the PDF renderer: pulls in the business's
  // profile and active bank account so both the "email it on creation" and
  // "download it later" paths render identical, accurate invoices.
  static _pdfDataFor = async (invoice, entity_id) => {
    const [entity, activeBank] = await Promise.all([
      entityRepository.findById(entity_id),
      bankRepo.findOne({ query: { entity: entity_id, isActive: true } }),
    ]);
    return {
      ...invoice.toJSON(),
      template: entity?.invoiceTemplate,
      businessName: entity?.name || "",
      businessAddress: entity?.address || "",
      businessPhone: entity?.phone || "",
      logoPath: entity?.logo || "",
      paymentLink: `${process.env.APP_URL || ""}/payment/${invoice.invoiceNumber}`,
      vatRate: invoice.subtotal ? (invoice.tax / invoice.subtotal) * 100 : 0,
      bank: activeBank
        ? {
            accountName: activeBank.accountName,
            accountNumber: activeBank.accountNumber,
            bankName: activeBank.bankName,
          }
        : null,
    };
  };

  // Create a new invoice
  static createInvoice = async (data, entity_id) => {
    const owningEntity = await entityRepository.findById(entity_id);
    abortIf(!owningEntity, httpStatus.BAD_REQUEST, "Invalid Entity Id");

    // Free-tier businesses are capped at a fixed number of invoices/month
    // (see src/config/plans.js) - the core upgrade trigger besides templates.
    const plan = getPlan(owningEntity.plan);
    if (plan.maxInvoicesPerMonth != null) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const countThisMonth = await invoiceRepository.countDocuments({
        entity: entity_id,
        createdAt: { $gte: startOfMonth },
      });
      abortIf(
        countThisMonth >= plan.maxInvoicesPerMonth,
        httpStatus.FORBIDDEN,
        `You've reached your ${plan.name} plan's limit of ${plan.maxInvoicesPerMonth} invoices this month. Upgrade your plan to create more.`
      );
    }

    let customer;
    abortIf(
      !data.customer && !data.customerId,
      httpStatus.BAD_REQUEST,
      "Customer is required"
    );
    if (data.customerId) {
      customer = await customerRepository.findOne({
        query: { _id: data.customerId },
      });
      abortIf(!customer, httpStatus.NOT_FOUND, "Customer not found");
    } else if (data.customer) {
      customer = await customerRepository.create({
        ...data.customer,
        entity: entity_id,
      });
      abortIf(!customer, httpStatus.BAD_REQUEST, "Error creating customer");
    }
    const { customer: user, customer_id, ...rest } = data;

    // Resolve any inventory-linked line items: validates stock, deducts it
    // atomically, and fills in name/description/unitPrice authoritatively
    // from the inventory record. Free-text (non-inventory) items pass
    // through unchanged. Throws (via abortIf) before the invoice is ever
    // created if any linked item is short on stock.
    const items = await InventoryService.reserveStockForItems(
      rest.items || [],
      entity_id
    );

    let invoice;
    try {
      invoice = await invoiceRepository.create({
        ...rest,
        items,
        customer: customer._id,
        entity: entity_id,
        status: "draft",
      });
    } catch (error) {
      // Stock was already deducted above - if invoice creation fails for
      // any other reason (e.g. a validation error unrelated to inventory),
      // put it back rather than silently losing it.
      await InventoryService.restoreStockForItems(items);
      throw error;
    }
    abortIf(!invoice, httpStatus.BAD_REQUEST, "Error creating invoice");

    // Best-effort: email the invoice to the customer so they actually have a
    // way to see and pay it. Never let a failed/unconfigured email block
    // invoice creation itself.
    if (customer.email) {
      InvoiceService._pdfDataFor(invoice, entity_id)
        .then((pdfData) => generateInvoice(pdfData))
        .then((pdfBuffer) =>
          sendEmail({
            to: customer.email,
            subject: `Invoice ${invoice.invoiceNumber}`,
            html: `<p>Hi ${customer.name || ""},</p><p>You have a new invoice <strong>${invoice.invoiceNumber}</strong> for ${invoice.currency} ${Number(invoice.total || 0).toFixed(2)}.</p><p>View and pay it here: <a href="${process.env.APP_URL || ""}/payment/${invoice.invoiceNumber}">${process.env.APP_URL || ""}/payment/${invoice.invoiceNumber}</a></p>`,
            attachments: [
              { filename: `invoice_${invoice.invoiceNumber}.pdf`, content: pdfBuffer },
            ],
          })
        )
        .catch((error) => console.error("Failed to email invoice:", error.message));
    }

    // Best-effort FIRS e-invoicing submission - currently always a no-op
    // (see firs.service.js), kept as a real call site so wiring up a
    // provider later doesn't require touching invoice creation at all.
    FirsService.submitInvoice(invoice).catch((error) =>
      console.error("FIRS submission failed:", error.message)
    );

    return invoice;
  };

  // Manually re-sends a payment reminder (email + WhatsApp, best-effort on
  // each) for one invoice right now, ignoring the scheduled chaser's
  // cooldown - an explicit request from the dashboard should always go out
  // immediately. Scoped to entity_id like update/deleteInvoice.
  static sendReminder = async (code, entity_id) => {
    const invoice = await invoiceRepository.findOne({
      query: { invoiceNumber: code, entity: entity_id },
      populate: [
        { path: "customer", select: "name email phone" },
        { path: "entity", select: "name" },
      ],
    });
    abortIf(!invoice, httpStatus.NOT_FOUND, "Invoice not found");
    abortIf(
      invoice.status === "paid",
      httpStatus.BAD_REQUEST,
      "This invoice is already paid - no reminder needed"
    );
    const result = await ReminderService.sendReminderForInvoice(invoice);
    // result.reason no longer exists at the top level now that email and
    // WhatsApp are attempted independently - surface whichever channel's
    // failure reason is more useful (email first, since it's the
    // lower-friction channel most businesses will have configured).
    abortIf(
      !result.sent,
      httpStatus.BAD_REQUEST,
      result.email?.reason || result.whatsapp?.reason || "Could not send reminder"
    );
    return result;
  };

  // Get all invoices
  static getAllInvoices = async (entity_id, filters = {}) => {
    let {
      status,
      search,
      customerCode,
      gteAmount,
      lteAmount,
      startDate,
      endDate,
      orderBy = "issueDate",
      orderDirection = "desc",
      page = 1,
      perPage = 10,
    } = filters;

    const matchStage = {
      entity: new mongoose.Types.ObjectId(entity_id),
    };

    if (status) {
      matchStage.status = { $in: status.split(",") };
    }

    if (gteAmount || lteAmount) {
      matchStage.subtotal = {};
      if (gteAmount) matchStage.subtotal.$gte = Number(gteAmount);
      if (lteAmount) matchStage.subtotal.$lte = Number(lteAmount);
    }

    if (startDate || endDate) {
      matchStage.issueDate = {};
      if (startDate) {
        const start = new Date(startDate);
        abortIf(
          isNaN(start.getTime()),
          httpStatus.BAD_REQUEST,
          "Invalid startDate format"
        );
        matchStage.issueDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        abortIf(
          isNaN(end.getTime()),
          httpStatus.BAD_REQUEST,
          "Invalid endDate format"
        );
        end.setHours(23, 59, 59, 999);
        matchStage.issueDate.$lte = end;
      }
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "entities",
          localField: "entity",
          foreignField: "_id",
          as: "entity",
        },
      },
      { $unwind: "$entity" },
    ];

    // Handle customerCode and search
    const searchMatch = {};
    if (customerCode) {
      searchMatch["customer.code"] = customerCode;
    }
    if (search) {
      searchMatch.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { "items.name": { $regex: search, $options: "i" } },
        { "customer.name": { $regex: search, $options: "i" } },
        { "customer.email": { $regex: search, $options: "i" } },
      ];
      if (!customerCode) {
        searchMatch.$or.push({
          "customer.code": { $regex: search, $options: "i" },
        });
      }
    }
    if (Object.keys(searchMatch).length > 0) {
      pipeline.push({ $match: searchMatch });
    }

    // Sorting
    const sort = {};
    const validOrderFields = [
      "issueDate",
      "dueDate",
      "subtotal",
      "invoiceNumber",
      "status",
    ];
    if (!validOrderFields.includes(orderBy)) {
      throw new Error(
        `Invalid orderBy field. Must be one of: ${validOrderFields.join(", ")}`
      );
    }
    const validDirections = ["asc", "desc"];
    if (!validDirections.includes(orderDirection)) {
      throw new Error(
        `Invalid orderDirection. Must be one of: ${validDirections.join(", ")}`
      );
    }
    sort[orderBy] = orderDirection === "asc" ? 1 : -1;
    pipeline.push({ $sort: sort });

    // Pagination
    const pagination = getPagination(page, perPage);
    const { skip, limit } = pagination;
    pipeline.push({ $skip: skip }, { $limit: limit });

    // Projection. currency/tax/total were missing here even though every
    // list UI needs "how much is this invoice for" - subtotal alone isn't
    // the payable amount once tax is applied.
    pipeline.push({
      $project: {
        invoiceNumber: 1,
        status: 1,
        subtotal: 1,
        tax: 1,
        total: 1,
        currency: 1,
        issueDate: 1,
        dueDate: 1,
        "customer.name": 1,
        "customer.email": 1,
        "customer.code": 1,
        items: 1,
        "entity.name": 1,
      },
    });

    // Execute the aggregation pipeline
    const invoices = await invoiceRepository.aggregate(pipeline);

    // Count total documents
    const countPipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
    ];
    if (Object.keys(searchMatch).length > 0) {
      countPipeline.push({ $match: searchMatch });
    }
    countPipeline.push({ $count: "total" });
    const countResult = await invoiceRepository.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Calculate total pages
    const totalPages = Math.ceil(total / pagination.perPage);

    return {
      invoices,
      pagination: {
        total,
        page: pagination.page,
        perPage: pagination.perPage,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPrevPage: pagination.page > 1,
      },
    };
  };

  // Get a single invoice by ID
  static getInvoiceById = async (code, entity_id) => {
    const invoice = await invoiceRepository.findOne({
      query: { invoiceNumber: code, entity: entity_id },
      populate: [
        { path: "customer", select: "name email phone" },
        { path: "entity" },
      ],
    });
    abortIf(!invoice, httpStatus.NOT_FOUND, "Invoice not found");
    return invoice;
  };

  // Public, unauthenticated view for the payment link embedded in every
  // invoice PDF/email. Deliberately not scoped by entity_id - the caller
  // (the customer) isn't logged in. invoiceNumber is an unguessable random
  // token (17 chars sliced from a UUID), the same "obscure link" pattern
  // payment-link products like Stripe/Paystack use for this exact case.
  static getPublicInvoice = async (code) => {
    const invoice = await invoiceRepository.findOne({
      query: { invoiceNumber: code },
      populate: [
        { path: "customer", select: "name email" },
        { path: "entity", select: "name logo address" },
      ],
    });
    abortIf(!invoice, httpStatus.NOT_FOUND, "Invoice not found");
    return invoice;
  };

  // Renders the invoice as a branded PDF and returns it as a Buffer, ready to
  // stream straight to the client - nothing is written to disk.
  static downloadInvoiceById = async (code, entity_id) => {
    const invoice = await invoiceRepository.findOne({
      query: { invoiceNumber: code, entity: entity_id },
      populate: [
        { path: "customer", select: "name email address phone" },
        { path: "entity" },
      ],
    });
    abortIf(!invoice, httpStatus.NOT_FOUND, "Invoice not found");
    const activeBank = await bankRepo.findOne({
      query: { entity: entity_id, isActive: true },
    });
    const pdfBuffer = await generateInvoice({
      ...invoice.toJSON(),
      template: invoice.entity?.invoiceTemplate,
      businessName: invoice.entity?.name || "",
      businessAddress: invoice.entity?.address || "",
      businessPhone: invoice.entity?.phone || "",
      logoPath: invoice?.entity?.logo || "",
      paymentLink: `${process.env.APP_URL || ""}/payment/${invoice.invoiceNumber}`,
      vatRate: invoice.subtotal ? (invoice.tax / invoice.subtotal) * 100 : 0,
      bank: activeBank
        ? {
            accountName: activeBank.accountName,
            accountNumber: activeBank.accountNumber,
            bankName: activeBank.bankName,
          }
        : null,
    });
    return { pdfBuffer, invoiceNumber: invoice.invoiceNumber };
  };

  // Update an invoice by ID. Scoped to entity_id so one business can never
  // edit another business's invoice by guessing/knowing its Mongo _id.
  static updateInvoice = async (code, data, entity_id) => {
    const existing = await invoiceRepository.findOne({
      query: { invoiceNumber: code, entity: entity_id },
    });
    abortIf(!existing, httpStatus.NOT_FOUND, "Invoice not found");
    const invoice = await invoiceRepository.update(existing._id, data);
    abortIf(!invoice, httpStatus.NOT_FOUND, "Invoice not found");
    return invoice;
  };

  // Delete an invoice by ID. Scoped to entity_id for the same reason as above.
  static deleteInvoice = async (code, entity_id) => {
    const existing = await invoiceRepository.findOne({
      query: { invoiceNumber: code, entity: entity_id },
    });
    abortIf(!existing, httpStatus.NOT_FOUND, "Invoice not found");
    // Undo whatever stock this invoice's inventory-linked line items
    // reserved on creation, before the invoice itself is gone.
    await InventoryService.restoreStockForItems(existing.items);
    const invoice = await invoiceRepository.delete(existing._id);
    abortIf(!invoice, httpStatus.NOT_FOUND, "Invoice not found");
    return invoice;
  };

  // `amount` is optional - omitting it (or passing the full balance due)
  // pays the invoice off in one go; passing a smaller amount is a partial
  // payment. Validated against the *remaining* balance (total - amountPaid),
  // not the invoice's original total, so a second/third partial payment
  // can't overpay it. The webhook handler (utils.service.js) is what
  // actually increments `amountPaid` once Paystack confirms the charge.
  static initiatePayment = async (code, amount = null) => {
    const invoice = await invoiceRepository.findOne({
      query: { invoiceNumber: code },
      populate: [
        { path: "customer", select: "name email" },
        { path: "entity" },
      ],
    });
    abortIf(!invoice, httpStatus.NOT_FOUND, "Invoice not found");
    abortIf(
      ["paid"].includes(invoice.status),
      httpStatus.BAD_REQUEST,
      "Invoice is already paid"
    );
    const balanceDue = Math.max(
      Number(invoice.total || 0) - Number(invoice.amountPaid || 0),
      0
    );
    abortIf(
      balanceDue <= 0,
      httpStatus.BAD_REQUEST,
      "Invoice is already paid"
    );
    abortIf(
      amount != null && amount <= 0,
      httpStatus.BAD_REQUEST,
      "Amount must be greater than zero"
    );
    abortIf(
      amount != null && amount > balanceDue,
      httpStatus.BAD_REQUEST,
      "Amount cannot be greater than the remaining balance due"
    );
    const payAmount = amount != null ? amount : balanceDue;
    let reference = crypto.randomUUID().split("-").join("").slice(0, 17);
    const getSubAccount = await bankRepo.findOne({
      query: {
        entity: invoice.entity,
        isActive: true,
      },
    });
    abortIf(
      !getSubAccount,
      httpStatus.BAD_REQUEST,
      "This business has no active bank account to receive payment"
    );
    const transaction = await transactionRepo.create({
      customer: invoice.customer._id,
      entity: invoice.entity._id,
      invoice: invoice._id,
      amount: payAmount,
      currency: "NGN",
      type: "PAYMENT",
      status: "PENDING",
      channel: "PAYSTACK",
      reference,
      description: `Payment for invoice ${invoice.invoiceNumber}`,
    });
    const paystackGateway = new PaystackPaymentGateway();
    const paymentResponse = await paystackGateway.initiatePayment({
      email: invoice.customer.email,
      amount: payAmount,
      currency: "NGN",
      reference,
      subaccount: getSubAccount.subAccountCode,
      metadata: {
        custom_fields: [
          {
            display_name: "Company",
            variable_name: "company_name",
            value: invoice.entity.name,
          },
          {
            display_name: "Logo",
            variable_name: "logo_url",
            value:
              invoice?.entity?.logo ||
              "https://unsplash.com/photos/a-person-swimming-in-the-ocean-with-a-mountain-in-the-background-s6g6ZSxM3kQ",
          },
        ],
      },
    });
    abortIf(
      !paymentResponse.success,
      httpStatus.BAD_REQUEST,
      paymentResponse.message
    );
    return paymentResponse;
  };

  // Partial-payment history for an invoice: every transaction attempt plus
  // the running amountPaid/balanceDue, for the dashboard's invoice detail
  // view. Scoped to entity_id like update/deleteInvoice.
  static getInvoiceTransactions = async (code, entity_id) => {
    const invoice = await invoiceRepository.findOne({
      query: { invoiceNumber: code, entity: entity_id },
    });
    abortIf(!invoice, httpStatus.NOT_FOUND, "Invoice not found");
    const transactions = await transactionRepo.findAll({
      query: { invoice: invoice._id },
      sort: { createdAt: -1 },
    });
    return {
      total: invoice.total,
      amountPaid: invoice.amountPaid || 0,
      balanceDue: Math.max(
        Number(invoice.total || 0) - Number(invoice.amountPaid || 0),
        0
      ),
      transactions,
    };
  };
}

module.exports = {
  InvoiceService,
};
