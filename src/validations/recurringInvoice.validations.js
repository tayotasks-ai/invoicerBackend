const Joi = require('joi');
const { FREQUENCIES } = require('../utils/recurringFrequency.util');

// Same item shape/rules as createInvoiceSchema (invoice.validations.js):
// an inventory-linked line only needs inventoryItemId + quantity, a
// free-text line needs name/unitPrice too. Kept separate rather than
// imported since this is a template line (no per-invoice fields like
// `total`), not an actual invoice item.
const itemSchema = Joi.object().keys({
  inventoryItemId: Joi.string().optional(),
  description: Joi.string().allow('').when('inventoryItemId', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.optional().allow(''),
  }),
  name: Joi.string().when('inventoryItemId', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  quantity: Joi.number().required().min(1),
  unitPrice: Joi.number().min(0).when('inventoryItemId', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
});

const createScheduleSchema = {
  body: Joi.object().required().keys({
    customerId: Joi.string().optional(),
    customer: Joi.object().keys({
      name: Joi.string().required(),
      email: Joi.string().email().optional(),
      phone: Joi.string().optional(),
    }).optional(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'NGN').default('NGN'),
    items: Joi.array().items(itemSchema).min(1).required(),
    tax: Joi.number().min(0).optional().default(0),
    notes: Joi.string().optional().allow(''),
    terms: Joi.string().optional().allow(''),
    frequency: Joi.string().valid(...FREQUENCIES).required(),
    dueInDays: Joi.number().integer().min(0).optional().default(14),
    startDate: Joi.date().required(),
    endDate: Joi.date().optional().allow(null).greater(Joi.ref('startDate')),
  }).xor('customerId', 'customer'),
};

const updateScheduleSchema = {
  body: Joi.object().required().keys({
    items: Joi.array().items(itemSchema).min(1).optional(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'NGN').optional(),
    tax: Joi.number().min(0).optional(),
    notes: Joi.string().optional().allow(''),
    terms: Joi.string().optional().allow(''),
    frequency: Joi.string().valid(...FREQUENCIES).optional(),
    dueInDays: Joi.number().integer().min(0).optional(),
    endDate: Joi.date().optional().allow(null),
  }),
};

module.exports = {
  createScheduleSchema,
  updateScheduleSchema,
};
