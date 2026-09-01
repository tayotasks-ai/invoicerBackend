const Joi = require('joi');

const requestExpenseSchema = {
  body: Joi.object().required().keys({
    vendorEmail: Joi.string().email().required(),
    vendorName: Joi.string().optional().allow(''),
    description: Joi.string().optional().allow(''),
  }),
};

// The vendor's own submission from the public link - deliberately
// permissive on bank field formats (no fixed-length/regex check on
// accountNumber) since this app doesn't yet resolve/validate bank accounts
// against a real bank-account-name-enquiry API (see the Seerbit payout
// integration for where that would plug in later); for now the business
// is expected to eyeball what was submitted before paying.
const submitExpenseSchema = {
  body: Joi.object().required().keys({
    payeeName: Joi.string().required(),
    amount: Joi.number().positive().required(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'NGN').default('NGN'),
    bankAccountNumber: Joi.string().required(),
    bankAccountName: Joi.string().required(),
    bankName: Joi.string().required(),
    bankCode: Joi.string().optional().allow(''),
  }),
};

const recordExpensePaymentSchema = {
  body: Joi.object().optional().keys({
    note: Joi.string().optional().allow(''),
  }),
};

module.exports = {
  requestExpenseSchema,
  submitExpenseSchema,
  recordExpensePaymentSchema,
};
