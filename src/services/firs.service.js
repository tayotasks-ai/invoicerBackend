// FIRS e-invoicing submission - NOT wired to a live provider yet.
//
// Nigeria's e-invoicing platform (the FIRS "Merchant Buyer Solution", built
// on Peppol BIS Billing 3.0) doesn't offer a self-serve public API for a
// software vendor to submit directly - you either become an accredited
// Access Point Provider yourself (a formal licensing process: ~NGN1M
// application fee plus NGN10M-100M minimum capital, per the September 2025
// regulatory guidelines) or integrate through an already-accredited
// middleware vendor (Flick, Taxlyne, and a handful of others). We don't yet
// have an account or API keys with any of them.
//
// This module exists so the rest of the codebase - invoice creation, the
// Invoice.firs status field, a future frontend compliance view - has a
// single, stable integration point to call into. Every invoice's `firs`
// field just sits at its schema default ('pending_integration') until a
// real adapter is wired up here; nothing pretends to have submitted
// something it hasn't.
//
// To wire up a real provider once one is chosen:
//   1. Get sandbox credentials from the chosen vendor and read their ACTUAL
//      API docs directly - don't guess at request/response shapes from
//      memory or secondhand summaries. Endpoint names discovered during
//      market research (e.g. Flick's "Onboard New Supplier" / "Generate
//      E-Invoice") were not independently verified against live docs.
//   2. Add that vendor's env vars (API key, base URL, etc) to sample/.env.
//   3. Implement `_submitToProvider(invoice, entity)` below: call their
//      "onboard supplier" endpoint (needs entity.tin - see entity.model.js)
//      once per business, then their "generate e-invoice" endpoint per
//      invoice, and map their real response (IRN, QR code, status) onto
//      invoice.firs via invoiceRepo.update.
//   4. Flip isFirsConfigured() to check for that vendor's env vars.

const invoiceRepo = require('../repo/invoice.repo');

function isFirsConfigured() {
  // Always false until a real adapter is implemented per the comment block
  // above - there is deliberately no vendor integration to "enable" yet.
  return false;
}

class FirsService {
  // Called fire-and-forget from InvoiceService.createInvoice, the same
  // pattern as the invoice-email send. With no provider configured this is
  // a no-op: the invoice keeps its default 'pending_integration' status
  // rather than anything claiming success or failure it can't back up.
  static submitInvoice = async (invoice) => {
    if (!isFirsConfigured()) {
      return { submitted: false, reason: 'FIRS integration not yet configured - see firs.service.js' };
    }
    // Unreachable until isFirsConfigured() is updated alongside a real
    // adapter implementation (step 3/4 above).
    try {
      throw new Error('FIRS provider adapter not implemented - see comments in firs.service.js');
    } catch (error) {
      await invoiceRepo.update(invoice._id, {
        firs: { status: 'error', error: error.message },
      });
      return { submitted: false, reason: error.message };
    }
  };
}

module.exports = { FirsService, isFirsConfigured };
