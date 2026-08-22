const Joi = require('joi');

const verifyBankAccount = {
    body: Joi.object().required().keys({
        accountNumber: Joi.string().required(),
        bankCode: Joi.string().required(),
    }),
}

module.exports = {
    verifyBankAccount
}