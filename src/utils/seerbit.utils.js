const axios = require("axios");

// Seerbit dedicated virtual accounts - lets a business activate a real bank
// account (provisioned on their behalf) for the Expenses/Accounts Payable
// feature. Real docs live at doc.seerbit.com (guides) and apis.seerbit.com
// (reference) - NOT docs.seerbit.com, which doesn't resolve at all.
//
// This client only covers account provisioning. Seerbit's payout ("Pocket")
// product is a separate, more involved integration - a multi-step chain
// that includes a human-facing OTP step and its own compliance approval
// beyond normal merchant KYC, with no confirmed webhook for payout status.
// That's deliberately not built here; see project notes/PR description for
// why. Nothing in this file initiates a transfer.
//
// Like whatsapp.util.js, isConfigured() lets callers check readiness rather
// than guessing from a thrown error. Unlike the reminder integrations
// though, provisioning is a deliberate one-off action a business owner
// clicks a button for (not a background job), so this module throws on
// failure instead of silently no-op'ing - EntityService.provisionVirtualAccount
// is expected to catch and translate that into a response the UI can show.

function isConfigured() {
  return !!(process.env.SEERBIT_PUBLIC_KEY && process.env.SEERBIT_SECRET_KEY);
}

function baseUrl() {
  return process.env.SEERBIT_BASE_URL || "https://seerbitapi.com";
}

// Seerbit's auth is a dynamically-generated bearer token, not a static API
// key: the public+secret key pair (joined with a literal ".") is exchanged
// for an encrypted token at /api/v2/encrypt/keys, which is then sent as
// `Authorization: Bearer <token>` on every other call. Seerbit's docs don't
// state an exact TTL, so this caches conservatively (45 min) and forces a
// fresh token on any 401 rather than trusting the cache indefinitely.
let _tokenCache = { token: null, fetchedAt: 0 };
const TOKEN_TTL_MS = 45 * 60 * 1000;

async function _fetchToken() {
  const key = `${process.env.SEERBIT_SECRET_KEY}.${process.env.SEERBIT_PUBLIC_KEY}`;
  const { data } = await axios.post(`${baseUrl()}/api/v2/encrypt/keys`, { key });
  const encryptedKey = data?.EncryptedSecKey?.encryptedKey;
  if (!encryptedKey) {
    throw new Error("Seerbit did not return an encrypted key - check SEERBIT_PUBLIC_KEY/SEERBIT_SECRET_KEY");
  }
  _tokenCache = { token: encryptedKey, fetchedAt: Date.now() };
  return encryptedKey;
}

async function _getToken(forceRefresh = false) {
  if (!forceRefresh && _tokenCache.token && Date.now() - _tokenCache.fetchedAt < TOKEN_TTL_MS) {
    return _tokenCache.token;
  }
  return _fetchToken();
}

// One retry on 401 (stale/expired cached token). Any other non-2xx is
// re-thrown as a clean Error carrying Seerbit's own message (not the raw
// axios error, and not a dump of the request/response body - callers must
// never end up logging an echoed-back bankVerificationNumber).
async function _authedPost(path, body, { retried = false } = {}) {
  const token = await _getToken();
  try {
    const { data } = await axios.post(`${baseUrl()}${path}`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  } catch (error) {
    if (error.response?.status === 401 && !retried) {
      await _getToken(true);
      return _authedPost(path, body, { retried: true });
    }
    const message = error.response?.data?.data?.message || error.response?.data?.message || error.message;
    throw new Error(message);
  }
}

// Provisions a dedicated (wallet) bank account for one business.
// `bankVerificationNumber` (BVN) is forwarded straight through to Seerbit
// in this one request and is never returned, logged, or cached by this
// module - see EntityService.provisionVirtualAccount, the only caller,
// which also never persists it.
async function createVirtualAccount({ fullName, email, reference, currency = "NGN", bankVerificationNumber }) {
  if (!isConfigured()) {
    throw new Error("Seerbit is not configured (SEERBIT_PUBLIC_KEY/SEERBIT_SECRET_KEY missing)");
  }
  const body = {
    publicKey: process.env.SEERBIT_PUBLIC_KEY,
    fullName,
    email,
    currency,
    reference,
  };
  if (bankVerificationNumber) body.bankVerificationNumber = bankVerificationNumber;

  const data = await _authedPost("/api/v2/virtual-accounts", body);
  const payments = data?.data?.payments;
  const ok = data?.status === "SUCCESS" && payments;
  if (!ok) {
    // Seerbit's own error description (e.g. "Invalid BVN") - not a dump of
    // the request/response, so this is safe to log/display.
    const message = data?.data?.message || data?.message || "Seerbit rejected the virtual account request";
    throw new Error(message);
  }
  return {
    reference: payments.reference || reference,
    accountNumber: payments.accountNumber,
    bankName: payments.bankName,
    accountName: payments.walletName || fullName,
  };
}

module.exports = { isConfigured, createVirtualAccount };
