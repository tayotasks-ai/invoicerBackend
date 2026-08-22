const Joi = require('joi');

const inviteAccountantSchema = {
    body: Joi.object().required().keys({
        email: Joi.string().email().required(),
    }),
};

module.exports = {
    inviteAccountantSchema,
};
