const Joi = require('joi');

// Line-item shape mirrors invoice.validations.js's createInvoiceSchema
// exactly (including the inventoryItemId conditional-requiredness pattern)
// so the frontend's item picker can be reused as-is between invoices and
// quotes.
const quoteItemSchema = Joi.object().keys({
    inventoryItemId: Joi.string().optional(),
    description: Joi.string().allow('').when('inventoryItemId', {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.required(),
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

const createQuoteSchema = {
    body: Joi.object().required().keys({
        customerId: Joi.string().optional(),
        currency: Joi.string().valid('USD', 'EUR', 'GBP', 'NGN').default('NGN'),
        customer: Joi.object().keys({
            name: Joi.string().required(),
            email: Joi.string().email().optional(),
            phone: Joi.string().optional()
        }).optional(),
        items: Joi.array().items(quoteItemSchema).required(),
        issueDate: Joi.date().required(),
        expiryDate: Joi.date().optional(),
        notes: Joi.string().optional().allow(''),
        terms: Joi.string().optional().allow(''),
        tax: Joi.number().optional().min(0).default(0),
    }).xor('customerId', 'customer'),
};

const updateQuoteSchema = {
    body: Joi.object().required().keys({
        customerId: Joi.string().optional(),
        customer: Joi.object().keys({
            name: Joi.string().optional(),
            email: Joi.string().email().optional(),
            phone: Joi.string().optional()
        }).optional(),
        items: Joi.array().items(quoteItemSchema).optional(),
        issueDate: Joi.date().optional(),
        expiryDate: Joi.date().optional(),
        status: Joi.string().valid('draft', 'sent', 'accepted', 'rejected', 'expired').optional(),
        notes: Joi.string().optional().allow(''),
        terms: Joi.string().optional().allow(''),
        tax: Joi.number().min(0).optional(),
    }),
};

// The customer's own accept/reject action from the public quote page -
// deliberately just these two values, not the full status enum (a customer
// can't mark their own quote "converted", that's the business's action).
const respondToQuoteSchema = {
    body: Joi.object().required().keys({
        response: Joi.string().valid('accepted', 'rejected').required(),
    }),
};

module.exports = {
    createQuoteSchema,
    updateQuoteSchema,
    respondToQuoteSchema,
};
