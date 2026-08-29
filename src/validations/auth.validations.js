const Joi = require('joi');

const signInSchema = {
    body: Joi.object().required().keys({
        email: Joi.string().required(),
        password: Joi.string().required(),
    }),
}

const signUpSchema = {
    body: Joi.object().required().keys({
        email: Joi.string().required(),
        password: Joi.string().required(),
        confirm_password: Joi.string().required(),
        name: Joi.string().required(),
        phone: Joi.string().allow('').optional(),
    }),
}

const forgotPasswordSchema = {
    body: Joi.object().required().keys({
        email: Joi.string().required(),
    }),
}

const resetPasswordSchema = {
    body: Joi.object().required().keys({
        token: Joi.string().required(),
        password: Joi.string().min(6).required(),
    }),
}

module.exports = {
    signInSchema,
    signUpSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
}