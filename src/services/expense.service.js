const expenseRepository = require("../repo/expense.repo");
const entityRepository = require("../repo/entity.repo");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const { sendEmail, isConfigured: isEmailConfigured } = require("../utils/email.util");
const { buildEmailHtml, esc } = require("../utils/templates/emailLayout");
const { money } = require("../utils/templates/money");

class ExpenseService {
  // Step 1 of the flow: the business only knows *who* they owe, not how
  // much or where to send it - that's what the vendor supplies next via the
  // public link. This just creates the placeholder record and emails the
  // vendor a link to `${APP_URL}/pay-expense/${code}` (see the frontend
  // router), mirroring how invoice/quote emails are built.
  static requestExpense = async (data, entity_id) => {
    const owningEntity = await entityRepository.findById(entity_id);
    abortIf(!owningEntity, httpStatus.BAD_REQUEST, "Invalid Entity Id");
    abortIf(!data.vendorEmail, httpStatus.BAD_REQUEST, "Vendor email is required");

    const expense = await expenseRepository.create({
      entity: entity_id,
      vendorEmail: data.vendorEmail,
      vendorName: data.vendorName || undefined,
      description: data.description || undefined,
      status: "pending",
    });

    const payLink = `${process.env.APP_URL || ""}/pay-expense/${expense.code}`;
    // Best-effort, same treatment as every other outbound notification in
    // this app (invoice/quote/reminder emails) - a failed/unconfigured send
    // shouldn't block the request record from existing. The business can
    // always resend by sharing the link manually if delivery ever fails.
    if (isEmailConfigured()) {
      sendEmail({
        to: data.vendorEmail,
        subject: `${owningEntity.name || "A business"} would like to pay you - action needed`,
        html: buildEmailHtml({
          preheader: `${esc(owningEntity.name || "A business")} owes you a payment and needs your bank details to send it.`,
          heading: `${esc(owningEntity.name || "A business")} wants to pay you`,
          bodyHtml: `<p style="margin:0 0 12px;">Hi${data.vendorName ? ` ${esc(data.vendorName)}` : ""}, <strong>${esc(owningEntity.name || "A business")}</strong> has an outstanding payment for you${data.description ? ` for: <em>${esc(data.description)}</em>` : ""}.</p><p style="margin:0;">To receive it, let them know the amount owed and where to send it - click below to fill in a quick form.</p>`,
          cta: { label: "Enter payment details", url: payLink },
          footnote: "If you weren't expecting this, you can safely ignore this email.",
        }),
      }).catch((error) => console.error("Failed to email expense request:", error.message));
    }

    return expense;
  };

  static getAllExpenses = async (entity_id, filters = {}) => {
    const query = { entity: entity_id };
    if (filters.status) query.status = filters.status;
    return expenseRepository.findAll({ query, sort: { createdAt: -1 } });
  };

  static getExpenseByCode = async (code, entity_id) => {
    const expense = await expenseRepository.findOne({ query: { code, entity: entity_id } });
    abortIf(!expense, httpStatus.NOT_FOUND, "Expense not found");
    return expense;
  };

  // The vendor's own view, reached purely by knowing the unguessable code -
  // no business auth, same trust model as the public quote/invoice links.
  // Populates only the entity's display fields (name/logo), never anything
  // that would leak the business's other data.
  static getPublicExpense = async (code) => {
    const expense = await expenseRepository.findOne({
      query: { code },
      populate: [{ path: "entity", select: "name logo" }],
    });
    abortIf(!expense, httpStatus.NOT_FOUND, "Expense request not found");
    return expense;
  };

  // The vendor's submission - only meaningful once, from 'pending'. Once
  // submitted, the vendor can't come back and change the amount/account
  // themselves (a business seeing bank details change silently after the
  // fact would be a real fraud vector) - if something needs correcting,
  // that's a conversation with the business, not a resubmission.
  static submitExpenseDetails = async (code, data) => {
    const expense = await expenseRepository.findOne({
      query: { code },
      populate: [{ path: "entity", select: "name email" }],
    });
    abortIf(!expense, httpStatus.NOT_FOUND, "Expense request not found");
    abortIf(
      expense.status !== "pending",
      httpStatus.BAD_REQUEST,
      expense.status === "submitted"
        ? "Payment details have already been submitted for this request."
        : "This request is no longer open."
    );

    const updated = await expenseRepository.update(expense._id, {
      payeeName: data.payeeName || expense.vendorName || undefined,
      amount: data.amount,
      currency: data.currency || "NGN",
      bankAccountNumber: data.bankAccountNumber,
      bankAccountName: data.bankAccountName,
      bankName: data.bankName,
      bankCode: data.bankCode || undefined,
      status: "submitted",
      submittedAt: new Date(),
    });

    // Best-effort nudge to the business - the action-items feed is the
    // durable source of truth, this email is just so they don't have to be
    // staring at the dashboard to notice.
    if (isEmailConfigured() && expense.entity?.email) {
      sendEmail({
        to: expense.entity.email,
        subject: `Payment details received - ${money(data.amount, data.currency || "NGN")} for ${data.payeeName || expense.vendorName || "a vendor"}`,
        html: buildEmailHtml({
          preheader: `${esc(data.payeeName || expense.vendorName || "A vendor")} submitted payment details for ${money(data.amount, data.currency || "NGN")}.`,
          heading: "Payment details submitted",
          bodyHtml: `<p style="margin:0;">${esc(data.payeeName || expense.vendorName || "A vendor")} has submitted their bank details for <strong>${esc(money(data.amount, data.currency || "NGN"))}</strong>${expense.description ? ` (${esc(expense.description)})` : ""}. Review it in invoecr and pay whenever you're ready.</p>`,
          cta: { label: "Review in invoecr", url: `${process.env.APP_URL || ""}/expenses` },
        }),
      }).catch((error) => console.error("Failed to email expense-submitted notice:", error.message));
    }

    return updated;
  };

  // Manual fulfillment - the business paid outside invoecr (their own bank
  // app, USSD, whatever) and is recording that here. Mirrors
  // InvoiceService.recordManualPayment: a self-attested record, not
  // processor-verified.
  static recordManualPayment = async (code, entity_id, { note } = {}) => {
    const expense = await ExpenseService.getExpenseByCode(code, entity_id);
    abortIf(
      expense.status !== "submitted",
      httpStatus.BAD_REQUEST,
      expense.status === "paid"
        ? "This expense has already been marked as paid."
        : "Payment details haven't been submitted for this expense yet."
    );
    return expenseRepository.update(expense._id, {
      status: "paid",
      paidVia: "manual",
      paidAt: new Date(),
      paymentNote: note || undefined,
    });
  };

  // Withdraws a request that hasn't been fulfilled yet - e.g. it was a
  // mistake, or the business ended up paying some other way entirely
  // outside this flow. Once paid, an expense is a historical record and
  // can't be cancelled.
  static cancelExpense = async (code, entity_id) => {
    const expense = await ExpenseService.getExpenseByCode(code, entity_id);
    abortIf(expense.status === "paid", httpStatus.BAD_REQUEST, "A paid expense can't be cancelled.");
    return expenseRepository.update(expense._id, { status: "cancelled" });
  };
}

module.exports = { ExpenseService };
