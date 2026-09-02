const Joi = require('joi');
const Spend = require('../models/spend.model');

const createSpendSchema = {
  body: Joi.object().required().keys({
    category: Joi.string().valid(...Spend.CATEGORIES).required(),
    description: Joi.string().optional().allow(''),
    amount: Joi.number().required().min(0.01),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'NGN').default('NGN'),
    date: Joi.date().optional(),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'card', 'pos', 'other').default('other'),
    payee: Joi.string().optional().allow(''),
  }),
};

const updateSpendSchema = {
  body: Joi.object().required().keys({
    category: Joi.string().valid(...Spend.CATEGORIES).optional(),
    description: Joi.string().optional().allow(''),
    amount: Joi.number().min(0.01).optional(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'NGN').optional(),
    date: Joi.date().optional(),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'card', 'pos', 'other').optional(),
    payee: Joi.string().optional().allow(''),
  }),
};

module.exports = {
  createSpendSchema,
  updateSpendSchema,
};
