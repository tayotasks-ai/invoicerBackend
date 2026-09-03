const { listBanks, verifyBankAccount } = require("../utils/bank.utils");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const {
  PaymentGateway,
  PaystackPaymentGateway,
  PaymentResponse,
} = require("../utils/paystack.utils");
const transactionRepo = require("../repo/transaction.repo");
const entityRepo = require("../repo/entity.repo");
const invoiceRepository = require("../repo/invoice.repo");
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
      const dataReq = object;
      const event = dataReq.event;
      const data = dataReq.data;

      // Only process charge.success events
      if (event === "charge.success") {
        try {
          await UtilsService.confirmPaystackPayment(data.reference);
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

  // The single place that actually confirms a Paystack payment and applies
  // its effects - re-verifies the reference directly against Paystack
  // (never trusts the caller's own claim of success) and then either
  // upgrades a subscription or credits an invoice. Called from two places
  // that can each fire for the same reference, sometimes more than once:
  //   - UtilsService.webhook, whenever Paystack's server-to-server
  //     charge.success event lands (possibly forwarded through the shared
  //     HRMS platform - see paystack.utils.js).
  //   - UtilsService.getPublicPaymentStatus, when the customer's browser
  //     lands back on invoecr after checkout and wants to know how it went
  //     - which doubles as a second, faster trigger for confirmation when
  //     the webhook is slow or hasn't arrived yet, rather than making the
  //     customer wait on it.
  // Safe to call more than once for the same reference: the atomic claim
  // below (see findOneAndUpdate's own comment in base.repo.js) means only
  // the first caller to reach it actually applies the payment - everyone
  // else gets outcome: "already_processed" and does nothing further.
  static confirmPaystackPayment = async (reference) => {
    const paystack = new PaystackPaymentGateway();
    const verification = await paystack.verifyTransaction(reference);
    if (!verification.success) {
      return { outcome: "not_successful", reference };
    }

    const metadata = verification.data?.metadata || {};

    // Subscription purchase (see EntityService.subscribe) - this reference
    // has no local Transaction/Invoice record, so it's handled separately
    // from the invoice-payment flow below.
    if (metadata.purpose === "subscription") {
      await UtilsService._handleSubscriptionPayment(metadata);
      return { outcome: "subscription_applied", reference, metadata };
    }

    const transaction = await transactionRepo.findOne({
      query: { reference },
    });
    if (!transaction) {
      return { outcome: "not_found", reference };
    }

    // Atomic conditional update: only claim this transaction (and thus
    // proceed to applyPayment) if it wasn't ALREADY SUCCESS - checking the
    // status first and writing second would leave a race open between two
    // near-simultaneous callers, since both could read "not yet SUCCESS"
    // before either writes.
    const claimed = await transactionRepo.findOneAndUpdate(
      { _id: transaction._id, status: { $ne: "SUCCESS" } },
      { status: "SUCCESS" }
    );
    if (!claimed) {
      return { outcome: "already_processed", reference, transaction };
    }

    // Cumulative amountPaid, status flip, and the "payment received"
    // receipt email all live in one place now (InvoiceService.applyPayment)
    // - shared with InvoiceService.recordManualPayment so a Paystack
    // payment and a manually-recorded one behave identically once
    // confirmed.
    const invoice = await InvoiceService.applyPayment(claimed.invoice, claimed.amount);
    if (!invoice) {
      return { outcome: "invoice_missing", reference, transaction: claimed };
    }

    return { outcome: "applied", reference, transaction: claimed, invoice };
  };

  // Public (unauthenticated), read-mostly status check for the customer-
  // facing payment callback page - see PaymentCallback.vue and
  // InvoiceController.getPaymentStatus. "Read-mostly" because it calls
  // confirmPaystackPayment above, which *can* write (see that method's own
  // comment on why calling it more than once is safe) - this is what lets a
  // customer see "payment received" immediately after checkout without
  // waiting on the webhook to land first.
  static getPublicPaymentStatus = async (reference) => {
    abortIf(
      !reference || typeof reference !== "string",
      httpStatus.BAD_REQUEST,
      "A payment reference is required"
    );

    const result = await UtilsService.confirmPaystackPayment(reference);

    if (result.outcome === "not_found") {
      abortIf(true, httpStatus.NOT_FOUND, "We couldn't find a payment with that reference");
    }
    if (result.outcome === "not_successful") {
      return { status: "failed", type: "invoice" };
    }
    if (result.outcome === "subscription_applied") {
      return { status: "success", type: "subscription" };
    }

    // "applied", "already_processed", or "invoice_missing" - fetch fresh,
    // authoritative state rather than trusting whatever
    // confirmPaystackPayment happened to return, since "already_processed"
    // doesn't carry the transaction/invoice at all.
    const transaction = await transactionRepo.findOne({ query: { reference } });
    if (!transaction) {
      abortIf(true, httpStatus.NOT_FOUND, "We couldn't find a payment with that reference");
    }
    const invoice = transaction.invoice
      ? await invoiceRepository.findOne({
          query: { _id: transaction.invoice },
          populate: [{ path: "entity", select: "name" }],
        })
      : null;

    return {
      status: transaction.status === "SUCCESS" ? "success" : "pending",
      type: "invoice",
      invoiceNumber: invoice?.invoiceNumber || null,
      businessName: invoice?.entity?.name || null,
      amount: transaction.amount,
      currency: transaction.currency,
    };
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
