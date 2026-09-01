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

// BVN is always exactly 11 digits in Nigeria. Never logged/persisted past
// this one request - see EntityService.provisionVirtualAccount.
const provisionVirtualAccountSchema = {
    body: Joi.object().required().keys({
        bankVerificationNumber: Joi.string().pattern(/^\d{11}$/).required().messages({
            'string.pattern.base': 'BVN must be exactly 11 digits',
        }),
    }),
}

module.exports = {
    addBankSchema,
    editEntitySchema,
    addMemberSchema,
    subscribeSchema,
    provisionVirtualAccountSchema
}