const Joi = require('joi');
const { PLANS } = require('../config/plans');

const setTestFlagSchema = {
    body: Joi.object().required().keys({
        enabled: Joi.boolean().required(),
    }),
}

const suspendMerchantSchema = {
    body: Joi.object().required().keys({
        reason: Joi.string().allow('').optional(),
    }),
}

const changePlanSchema = {
    body: Joi.object().required().keys({
        plan: Joi.string().valid(...Object.keys(PLANS)).required(),
    }),
}

module.exports = {
    setTestFlagSchema,
    suspendMerchantSchema,
    changePlanSchema,
}
