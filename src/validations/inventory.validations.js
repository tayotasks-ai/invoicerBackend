const Joi = require('joi');

const createInventoryItemSchema = {
    body: Joi.object().required().keys({
        name: Joi.string().required(),
        sku: Joi.string().allow('').optional(),
        description: Joi.string().allow('').optional(),
        unitPrice: Joi.number().required().min(0),
        quantityInStock: Joi.number().min(0).default(0),
        lowStockThreshold: Joi.number().min(0).default(0),
        unit: Joi.string().allow('').optional(),
    }),
}

const updateInventoryItemSchema = {
    body: Joi.object().required().keys({
        name: Joi.string().optional(),
        sku: Joi.string().allow('').optional(),
        description: Joi.string().allow('').optional(),
        unitPrice: Joi.number().min(0).optional(),
        quantityInStock: Joi.number().min(0).optional(),
        lowStockThreshold: Joi.number().min(0).optional(),
        unit: Joi.string().allow('').optional(),
        isActive: Joi.boolean().optional(),
    }),
}

module.exports = {
    createInventoryItemSchema,
    updateInventoryItemSchema,
}
