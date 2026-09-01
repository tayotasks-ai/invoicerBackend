const Joi = require('joi');

const createInvoiceSchema = {
    body: Joi.object().required().keys({
        customerId: Joi.string().optional(),
        currency: Joi.string().valid('USD', 'EUR', 'GBP', 'NGN').default('NGN'),
        customer: Joi.object().keys({
            name: Joi.string().required(),
            email: Joi.string().email().optional(),
            phone: Joi.string().optional()
        }).optional(),
        items: Joi.array().items(
            Joi.object().keys({
                // When inventoryItemId is set, name/description/unitPrice
                // are optional here - the backend fills them in
                // authoritatively from the inventory record (see
                // InventoryService.reserveStockForItems), ignoring whatever
                // the client sent, so a request can't invoice inventory at
                // an arbitrary price. Without inventoryItemId, this is a
                // free-text line item and those fields stay required, same
                // as before.
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
            })
        ).required(),
        issueDate: Joi.date().required(),
        dueDate: Joi.date().optional(),
        status: Joi.string().valid('draft', 'sent', 'paid', 'overdue', 'partially-paid').default('draft'),
        notes: Joi.string().optional().allow(''),
        terms: Joi.string().optional().allow(''),
        // subtotal/total are recomputed server-side from items in a Mongoose
        // pre-save hook, so we don't require the client to send (or trust) one.
        subtotal: Joi.number().min(0).optional(),
        tax: Joi.number().optional().min(0).default(0),
    }).xor('customerId', 'customer'),
    files: Joi.object().optional().keys({
        file: Joi.object().optional().keys({
            mimetype: Joi.string().valid('image/jpeg', 'image/png').required(),
            size: Joi.number().max(3 * 1024 * 1024).required() // 5MB limit
        })
    })
    .optional(),
};

const updateInvoiceSchema = {
    body: Joi.object().required().keys({
        customerId: Joi.string().optional(),
        customer: Joi.object().keys({
            name: Joi.string().optional(), // Optional for update
            email: Joi.string().email().optional(),
            phone: Joi.string().optional()
        }).optional(),
        items: Joi.array().items(
            Joi.object().keys({
                description: Joi.string().optional(), // Optional for update
                quantity: Joi.number().min(1).optional(),
                unitPrice: Joi.number().min(0).optional(),
            })
        ).optional(),
        issueDate: Joi.date().optional(),
        dueDate: Joi.date().optional(),
        status: Joi.string().valid('draft', 'sent', 'paid', 'overdue', 'partially-paid').optional(),
        notes: Joi.string().optional().allow(''),
        terms: Joi.string().optional().allow(''),
        subtotal: Joi.number().min(0).optional(),
        tax: Joi.number().min(0).optional(),
    }).or('customerId', 'customer') // At least one of customerId or customer must be provided if either is present
    ,files: Joi.object().optional().keys({
        file: Joi.object().optional().keys({
            mimetype: Joi.string().valid('image/jpeg', 'image/png').required(),
            size: Joi.number().max(3 * 1024 * 1024).required() // 5MB limit
        })
    })
    .optional(),
};

// `amount` is optional - omitted/full balance pays the invoice off in one
// go, a smaller value is a partial payment (see InvoiceService.initiatePayment).
const initiatePaymentSchema = {
    body: Joi.object().optional().keys({
        amount: Joi.number().positive().optional(),
    }),
};

const recordPaymentSchema = {
    body: Joi.object().required().keys({
        amount: Joi.number().positive().required(),
        method: Joi.string().valid('bank_transfer', 'cash', 'pos', 'other').required(),
        reference: Joi.string().optional().allow(''),
        note: Joi.string().optional().allow(''),
    }),
};

module.exports = {
    createInvoiceSchema,
    updateInvoiceSchema,
    initiatePaymentSchema,
    recordPaymentSchema
};
