const { listBanks, verifyBankAccount } = require("../utils/bank.utils");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status");
const {
  PaymentGateway,
  PaystackPaymentGateway,
  PaymentResponse,
} = require("../utils/paystack.utils");
const transactionRepo = require("../repo/transaction.repo");
const entityRepo = require("../repo/entity.repo");
const crypto = require("crypto");
// Required directly (not via '../services') - that barrel also requires
// UtilsService, so going through it here would be circular.
const { InvoiceService } = require("./invoice.service");

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

          // Paystack retries a webhook that didn't get a prompt 200 (and,
          // now that this Paystack account's webhook is shared with another
          // product forwarding events on to us, a delivery could plausibly
          // be duplicated in transit too) - so this same charge.success can
          // arrive more than once for the same transaction. Flipping status
          // to SUCCESS and calling applyPayment unconditionally would
          // double-credit the invoice on a second delivery. Guard against it
          // with an atomic conditional update: only claim this transaction
          // (and thus proceed to applyPayment) if it wasn't ALREADY
          // SUCCESS - checking the status first and writing second would
          // leave the same race open between two near-simultaneous
          // deliveries, since both could read "not yet SUCCESS" before
          // either writes.
          const claimed = await transactionRepo.findOneAndUpdate(
            { _id: transaction._id, status: { $ne: "SUCCESS" } },
            { status: "SUCCESS" }
          );
          if (!claimed) return {}; // Already processed - not an error, just a duplicate delivery.

          // Cumulative amountPaid, status flip, and the "payment received"
          // receipt email all live in one place now (InvoiceService.
          // applyPayment) - shared with InvoiceService.recordManualPayment
          // so a Paystack payment and a manually-recorded one behave
          // identically once confirmed.
          const invoice = await InvoiceService.applyPayment(transaction.invoice, transaction.amount);
          if (!invoice) return {};

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
