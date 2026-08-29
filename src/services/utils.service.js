const { listBanks, verifyBankAccount } = require("../utils/bank.utils");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status");
const {
  PaymentGateway,
  PaystackPaymentGateway,
  PaymentResponse,
} = require("../utils/paystack.utils");
const transactionRepo = require("../repo/transaction.repo");
const invoiceRepo = require("../repo/invoice.repo");
const customerRepo = require("../repo/customer.repo");
const entityRepo = require("../repo/entity.repo");
const { sendEmail } = require("../utils/email.util");
const crypto = require("crypto");
const { buildEmailHtml, esc, infoRow } = require("../utils/templates/emailLayout");
const { money } = require("../utils/templates/money");

class UtilsService {
  static listAllBanks = async () => {
    const getBanks = await listBanks();
    return getBanks;
  };

  static verifyBankNumber = async (accountNumber, bankCode) => {
    const verifyBank = await verifyBankAccount(accountNumber, bankCode);
    abortIf(!verifyBank.status, httpStatus.BAD_REQUEST, verifyBank.message);
    return verifyBank.data;
  };

  // Paystack signs every webhook payload with HMAC-SHA512 of the *raw* request
  // body, using the account's secret key, in the `x-paystack-signature`
  // header. Without checking this, anyone can POST a fake `charge.success`
  // event and mark invoices as paid. `rawBody` must be the exact bytes Paystack
  // sent (captured via express.json's `verify` option in app.js), not
  // JSON.stringify(req.body), since key order/whitespace would differ.
  static verifyWebhookSignature = (rawBody, signatureHeader) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Paystack Secret Key is not defined");
    }
    if (!signatureHeader || !rawBody) return false;

    const expectedHash = crypto
      .createHmac("sha512", secretKey)
      .update(rawBody)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedHash, "utf8"),
        Buffer.from(signatureHeader, "utf8")
      );
    } catch (error) {
      // Buffer length mismatch etc. - treat as an invalid signature.
      return false;
    }
  };

  static webhook = async (object) => {
    try {
      const paystack = new PaystackPaymentGateway();
      const dataReq = object;
      const event = dataReq.event;
      const data = dataReq.data;

      // Only process charge.success events
      if (event === "charge.success") {
        try {
          const verification = await paystack.verifyTransaction(data.reference);
          if (!verification.success) return {};

          const metadata = verification.data?.metadata || {};

          // Subscription purchase (see EntityService.subscribe) - this
          // reference has no local Transaction/Invoice record, so it's
          // handled separately from the invoice-payment flow below.
          if (metadata.purpose === "subscription") {
            await UtilsService._handleSubscriptionPayment(metadata);
            return {};
          }

          const transaction = await transactionRepo.findOne({
            query: { reference: data.reference },
          });
          if (!transaction) return {};
          await transactionRepo.update(transaction._id, {
            status: "SUCCESS",
          });

          const _in = await invoiceRepo.findById(transaction.invoice);
          if (!_in) return {};

          // Cumulative across every successful transaction, so an invoice
          // paid in several partial installments ends up "paid" only once
          // the running total actually covers it - not on any single
          // transaction alone.
          const amountPaid =
            Number(_in.amountPaid || 0) + Number(transaction.amount || 0);
          const total = Number(_in.total || 0);
          const status = amountPaid >= total ? "paid" : "partially-paid";
          const invoice = await invoiceRepo.update(transaction.invoice, {
            amountPaid,
            status,
          });

          // Best-effort payment receipt - never let a mail failure affect
          // webhook processing, which Paystack already got a 200 for.
          try {
            const customer = await customerRepo.findById(transaction.customer);
            if (customer?.email) {
              const balanceDue = Math.max(total - amountPaid, 0);
              await sendEmail({
                to: customer.email,
                subject: `Payment received for invoice ${_in.invoiceNumber}`,
                html: buildEmailHtml({
                  preheader: `We've received your payment for invoice ${_in.invoiceNumber}.`,
                  heading: "Payment received",
                  bodyHtml: `<p style="margin:0 0 10px;">Hi ${esc(customer.name || "there")}, we've received your payment for invoice <strong>${esc(_in.invoiceNumber)}</strong>.</p>
${infoRow("Amount paid", money(transaction.amount, transaction.currency))}
${status === "paid"
  ? infoRow("Status", "Fully paid")
  : infoRow("Balance remaining", money(balanceDue, _in.currency))}`,
                  footnote: "Thank you!",
                }),
              });
            }
          } catch (emailError) {
            console.error("Failed to send payment receipt:", emailError.message);
          }

          return {};
        } catch (error) {
          console.error("Charge success error:", error);
          return {};
        }
      }
    } catch (error) {
      console.error("Webhook service error:", error);
      return {};
    }
  };

  // Upgrades the paying entity's plan once a subscription charge clears.
  // `planRenewsAt` is informational only for now - there's no auto-downgrade
  // job when it lapses, since real recurring billing needs a Paystack
  // dashboard-configured Subscription Plan (see src/config/plans.js).
  static _handleSubscriptionPayment = async (metadata) => {
    try {
      const { entityId, plan } = metadata;
      if (!entityId || !plan) return;
      const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await entityRepo.update(entityId, { plan, planRenewsAt: renewsAt });
    } catch (error) {
      console.error("Failed to upgrade subscription:", error.message);
    }
  };
}

module.exports = {
  UtilsService,
};
