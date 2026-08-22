const Joi = require('joi');
const { THEMES } = require('../utils/templates/themes');

const addBankSchema = {
    body: Joi.object().required().keys({
        accountNumber: Joi.string().required(),
        bankCode: Joi.string().required(),
        isActive: Joi.boolean().required().default(false),
    }),
}

const editEntitySchema = {
    body: Joi.object().required().keys({
        phone: Joi.string().optional(),
        logo: Joi.string().optional(),
        address: Joi.string().optional(),
        invoiceTemplate: Joi.string().valid(...THEMES.map((t) => t.id)).optional(),
        tin: Joi.string().allow('').optional(),
        whatsappRemindersEnabled: Joi.boolean().optional(),
    })
}

const subscribeSchema = {
    body: Joi.object().required().keys({
        plan: Joi.string().valid('growth', 'business').required(),
    }),
}

const addMemberSchema = {
    body: Joi.object().required().keys({
        first_name: Joi.string().required(),
        last_name: Joi.string().required(),
        email: Joi.string().required(),
        type: Joi.string().required(),
    })
}

module.exports = {
    addBankSchema,
    editEntitySchema,
    addMemberSchema,
    subscribeSchema
}