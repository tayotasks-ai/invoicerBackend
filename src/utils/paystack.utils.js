const Paystack = require('paystack');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
require('dotenv').config();

// This Paystack account/secret key is shared with another product (an HR
// platform) that has its own webhook consumer. Paystack only lets one
// webhook URL be configured per account, so every event - regardless of
// which product's transaction it belongs to - lands on that other
// platform's endpoint first; it inspects the reference and forwards
// invoecr's events on to this app's own /webhook route (see
// webhook.route.js / UtilsService.webhook).
//
// For that routing to work, every reference invoecr generates must be
// unmistakably ours - hence the REFERENCE_PREFIX below - and must not
// collide with a reference either app could generate. Every call site that
// starts a Paystack transaction (invoice payments, subscription upgrades)
// MUST go through generatePaystackReference() rather than rolling its own
// reference, so this stays the single place that guarantees both
// properties. The purpose segment (e.g. "invoice", "subscription") is just
// for readability when debugging in the Paystack dashboard - the routing
// itself only needs to key off REFERENCE_PREFIX.
//
// Do not change REFERENCE_PREFIX without coordinating with whoever owns the
// forwarding logic on the other platform - it's the contract between the
// two apps.
const REFERENCE_PREFIX = 'ivcr';

function generatePaystackReference(purpose) {
  // 32 hex characters (a full v4 UUID with the dashes stripped) - the same
  // entropy Node's crypto.randomUUID gives, so a collision is not a
  // realistic concern even shared across two products on one account.
  const random = crypto.randomUUID().replace(/-/g, '');
  return `${REFERENCE_PREFIX}_${purpose}_${random}`;
}

/**
 * Abstract base class for payment gateways
 */
class PaymentGateway {
  /**
   * Initiates a payment transaction
   * @param {Object} params - Payment parameters
   * @param {string} params.email - Customer's email
   * @param {number} params.amount - Amount to charge
   * @param {string} params.currency - Currency (e.g., NGN, USD)
   * @param {string} [params.reference] - Optional transaction reference
   * @returns {Promise<PaymentResponse>} - Payment response
   */
  async initiatePayment({ email, amount, currency, reference }) {
    throw new Error('Method initiatePayment must be implemented');
  }

  /**
   * Verifies a transaction
   * @param {string} reference - Transaction reference
   * @returns {Promise<PaymentResponse>} - Verification response
   */
  async verifyTransaction(reference) {
    throw new Error('Method verifyTransaction must be implemented');
  }

  /**
   * Creates a subaccount
   * @param {Object} params - Subaccount parameters
   * @returns {Promise<PaymentResponse>} - Subaccount creation response
   */
  async createSubaccount(params) {
    throw new Error('Method createSubaccount must be implemented');
  }
}

/**
 * Response model for payment operations
 */
class PaymentResponse {
  constructor({ success, reference, message, status, data }) {
    this.success = success;
    this.reference = reference;
    this.message = message;
    this.status = status;
    this.data = data;
  }
}

/**
 * Paystack payment gateway implementation
 */
class PaystackPaymentGateway extends PaymentGateway {
  /**
   * Initializes the Paystack client with the secret key
   * @throws {Error} If PAYSTACK_SECRET_KEY is not defined
   */
  constructor() {
    super();
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new Error('Paystack Secret Key is not defined in environment variables');
    }
    this.paystack = Paystack(secretKey);
  }

  /**
   * Initiates a payment transaction
   * @param {Object} params - Payment parameters
   * @returns {Promise<PaymentResponse>} - Payment response with authorization URL
   */
  async initiatePayment({ email, amount, currency, reference, subaccount, metadata }) {
    try {
      const txRef = reference || `PSTK_${uuidv4()}`;
      const transactionData = {
        email,
        amount: Math.round(amount * 100), // Convert to kobo
        currency,
        reference: txRef,
        callback_url: process.env.PAYSTACK_CALLBACK_URL || 'https://yourapp.com/callback',
        metadata
      };

      // Add subaccount if provided. bearer: 'subaccount' means Paystack's own
      // processing fee is deducted from the business's share, not invoecr's
      // main account - consistent with invoecr taking a 0% platform cut (see
      // percentage_charge: 0 in entity.service.js's addBank). Without this,
      // Paystack's default (`bearer: 'account'`) would charge that fee to
      // invoecr's main balance on every transaction with nothing in the
      // split to offset it.
      if (subaccount) {
        transactionData.subaccount = subaccount;
        transactionData.bearer = 'subaccount';
      }

      const response = await this.paystack.transaction.initialize(transactionData);

      if (response.status) {
        return new PaymentResponse({
          success: true,
          reference: txRef,
          status: response.status,
          message: 'Payment initiated successfully',
          data: response.data, // Includes authorization_url
        });
      }
      return new PaymentResponse({
        success: false,
        reference: txRef,
        status: response.status,
        message: response.message || 'Payment initiation failed',
      });
    } catch (error) {
      return new PaymentResponse({
        success: false,
        reference,
        message: `Error: ${error.message}`,
      });
    }
  }

  /**
   * Verifies a transaction
   * @param {string} reference - Transaction reference
   * @returns {Promise<PaymentResponse>} - Verification response
   */
  async verifyTransaction(reference) {
    try {
      const response = await this.paystack.transaction.verify(reference);
      if (response.status && response.data.status === 'success') {
        return new PaymentResponse({
          success: true,
          reference,
          status: response.data.status,
          message: 'Transaction verified successfully',
          data: response.data,
        });
      }
      return new PaymentResponse({
        success: false,
        reference,
        status: response.data?.status,
        message: 'Transaction verification failed',
      });
    } catch (error) {
      return new PaymentResponse({
        success: false,
        reference,
        message: `Error: ${error.message}`,
      });
    }
  }

  /**
   * Creates a subaccount
   * @param {Object} params - Subaccount parameters
   * @param {string} params.business_name - Name of the business
   * @param {string} params.account_number - Bank account number
   * @param {string} params.bank_code - Bank code
.ConcurrentModificationException @param {number} params.percentage_charge - Percentage of transaction to charge
   * @param {string} [params.description] - Optional description
   * @param {string} [params.primary_contact_email] - Optional contact email
   * @returns {Promise<PaymentResponse>} - Subaccount creation response
   */
  async createSubaccount({ 
    business_name, 
    account_number, 
    bank_code, 
    percentage_charge, 
    description, 
    primary_contact_email 
  }) {
    try {
      const response = await this.paystack.subaccount.create({
        business_name,
        settlement_bank: bank_code,
        account_number,
        percentage_charge,
        description: description || `Subaccount for ${business_name}`,
        primary_contact_email
      });

      if (response.status) {
        return new PaymentResponse({
          success: true,
          reference: response.data.subaccount_code,
          status: response.status,
          message: 'Subaccount created successfully',
          data: response.data
        });
      }
      return new PaymentResponse({
        success: false,
        reference: null,
        status: response.status,
        message: response.message || 'Subaccount creation failed'
      });
    } catch (error) {
      return new PaymentResponse({
        success: false,
        reference: null,
        message: `Error: ${error.message}`
      });
    }
  }

  /**
   * Updates an existing subaccount - used to migrate subaccounts created
   * before the platform-fee change (see entity.service.js's addBank) onto
   * their new percentage_charge, since that change only affects subaccounts
   * created going forward. See AdminService.syncSubaccountFees.
   * @param {string} subaccount_code - The subaccount's code (e.g. ACCT_xxx)
   * @param {Object} params - Fields to update
   * @param {number} [params.percentage_charge] - New percentage charged to the main account
   * @returns {Promise<PaymentResponse>}
   */
  async updateSubaccount(subaccount_code, params) {
    try {
      const response = await this.paystack.subaccount.update(subaccount_code, params);
      if (response.status) {
        return new PaymentResponse({
          success: true,
          reference: subaccount_code,
          status: response.status,
          message: 'Subaccount updated successfully',
          data: response.data,
        });
      }
      return new PaymentResponse({
        success: false,
        reference: subaccount_code,
        status: response.status,
        message: response.message || 'Subaccount update failed',
      });
    } catch (error) {
      return new PaymentResponse({
        success: false,
        reference: subaccount_code,
        message: `Error: ${error.message}`,
      });
    }
  }
}

/**
 * Example usage
 */
async function main() {
  try {
    const paystackGateway = new PaystackPaymentGateway();

    // Create subaccount
    const subaccountResponse = await paystackGateway.createSubaccount({
      business_name: 'Test Merchant',
      account_number: '1234567890',
      bank_code: '033', // Example bank code for United Bank for Africa
      percentage_charge: 10, // 10% of transaction
      description: 'Test merchant subaccount',
      primary_contact_email: 'merchant@example.com'
    });
    console.log('Paystack Subaccount:', subaccountResponse);

    // Initiate payment
    const paymentResponse = await paystackGateway.initiatePayment({
      email: 'user@example.com',
      amount: 1000,
      currency: 'NGN',
      metadata: {
        subaccount: subaccountResponse.data?.subaccount_code
      }
    });
    console.log('Paystack Payment:', paymentResponse);

    // Verify transaction
    if (paymentResponse.success) {
      const verifyResponse = await paystackGateway.verifyTransaction(paymentResponse.reference);
      console.log('Paystack Verification:', verifyResponse);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run example
// main();

module.exports = {
  PaymentGateway,
  PaystackPaymentGateway,
  PaymentResponse,
  generatePaystackReference,
  REFERENCE_PREFIX,
};