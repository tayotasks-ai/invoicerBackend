// Grosses up an invoice amount so that, once Paystack takes its cut, the
// business still receives exactly what they billed for - i.e. the
// *customer* pays the payment-processing fee, not the business.
//
// Paystack's local fee (Nigeria - cards, bank transfer, USSD, Direct
// Debit): 1.5% of the transaction + NGN 100, capped at NGN 2,000 total fee,
// with the NGN 100 flat fee waived for transactions under NGN 2,500. See
// https://support.paystack.com/en/articles/2130306.
//
// The tricky part: Paystack's fee is calculated on the amount actually
// charged, not on the business's original amount. So you can't just compute
// the fee on the original amount and add it - that undercharges slightly,
// because the fee on the *new, higher* total is itself higher. This solves
// the fee-inclusive total algebraically instead (the standard payment-gateway
// "gross-up" calculation), by considering each fee regime Paystack could
// land in and picking whichever one is internally consistent.
const FEE_RATE = 0.015; // 1.5%
const FLAT_FEE = 100; // NGN, waived under the threshold below
const FLAT_FEE_THRESHOLD = 2500; // NGN - transactions under this pay no flat fee
const FEE_CAP = 2000; // NGN - Paystack never charges more than this per transaction

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Paystack's actual fee for a given *charged* amount - used for display/
// verification, not for the gross-up math itself (see below).
function calculateFeeForChargedAmount(chargedAmount) {
  if (chargedAmount < FLAT_FEE_THRESHOLD) {
    return round2(chargedAmount * FEE_RATE);
  }
  const fee = chargedAmount * FEE_RATE + FLAT_FEE;
  return round2(Math.min(fee, FEE_CAP));
}

// Given the amount a business wants to actually receive (netAmount, e.g. an
// invoice's subtotal + tax), returns the total to charge the customer via
// Paystack such that netAmount lands in the business's account after
// Paystack's fee, plus the fee amount itself (for display as a line item).
//
// Tries each fee regime in turn and keeps the first one that's
// self-consistent (i.e. the resulting total actually falls in the amount
// range that regime assumes) - there's always exactly one.
function grossUpForPaystackFee(netAmount) {
  const amount = Number(netAmount) || 0;
  if (amount <= 0) {
    return { total: 0, fee: 0 };
  }

  // Regime 1: total stays under the flat-fee threshold, so only the
  // percentage applies. total - (total * rate) = amount.
  const totalNoFlat = amount / (1 - FEE_RATE);
  if (totalNoFlat < FLAT_FEE_THRESHOLD) {
    return { total: round2(totalNoFlat), fee: round2(totalNoFlat - amount) };
  }

  // Regime 2: flat fee applies, uncapped. total - (total*rate + FLAT) = amount.
  const totalWithFlat = (amount + FLAT_FEE) / (1 - FEE_RATE);
  const uncappedFee = totalWithFlat * FEE_RATE + FLAT_FEE;
  if (uncappedFee <= FEE_CAP) {
    return { total: round2(totalWithFlat), fee: round2(uncappedFee) };
  }

  // Regime 3: fee is capped at FEE_CAP regardless of amount - Paystack takes
  // a flat NGN 2,000, so the customer just pays amount + 2,000.
  return { total: round2(amount + FEE_CAP), fee: FEE_CAP };
}

module.exports = { grossUpForPaystackFee, calculateFeeForChargedAmount };
