const catchAsync = require('../utils/catchAsync');
const { InvoiceService } = require('../services');
const { successResponse } = require('../utils/responder');
const httpStatus = require('http-status');

class InvoiceController {
  // Create a new invoice
  static createInvoice = catchAsync(async (req, res, next) => {
    const invoiceData = req.body;
    const user = req.user; 
    const invoice = await InvoiceService.createInvoice(invoiceData, user.id);
    return successResponse(req, res, invoice);
  });

  // Get all invoices
  static getAllInvoices = catchAsync(async (req, res, next) => {
    const user = req.user;
    const query = req.query;
    const invoices = await InvoiceService.getAllInvoices(user.id, query);
    return successResponse(req, res, invoices);
  });

  // Same filters as getAllInvoices, but every matching row rather than one
  // page - a CSV download instead of a JSON envelope, same idea as
  // downloadInvoiceById.
  static exportCsv = catchAsync(async (req, res, next) => {
    const user = req.user;
    const csv = await InvoiceService.exportInvoicesCsv(user.id, req.query);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="invoices.csv"');
    return res.send(csv);
  });

  static initiatePayment = catchAsync(async (req, res, next) => {
    const { code } = req.params;
    // `amount` is optional - a partial payment (see InvoiceService docstring).
    // It was silently dropped before, which meant partial payments could
    // never actually be initiated even though the service supported them.
    const { amount } = req.body || {};
    const invoices = await InvoiceService.initiatePayment(code, amount);
    return successResponse(req, res, invoices);
  });

  // Manually fires a WhatsApp payment reminder right now (see
  // ReminderService/sendPaymentReminders.js for the scheduled version).
  static sendReminder = catchAsync(async (req, res, next) => {
    const { code } = req.params;
    const user = req.user;
    const result = await InvoiceService.sendReminder(code, user.id);
    return successResponse(req, res, result, "Reminder sent");
  });

  static getInvoiceTransactions = catchAsync(async (req, res, next) => {
    const { code } = req.params;
    const user = req.user;
    const result = await InvoiceService.getInvoiceTransactions(code, user.id);
    return successResponse(req, res, result);
  });

  // Records a payment collected outside Paystack (bank transfer, cash,
  // POS) against this invoice.
  static recordPayment = catchAsync(async (req, res, next) => {
    const { code } = req.params;
    const user = req.user;
    const result = await InvoiceService.recordManualPayment(code, user.id, req.body);
    return successResponse(req, res, result, "Payment recorded");
  });

  // Undoes a mis-recorded manual payment.
  static voidPayment = catchAsync(async (req, res, next) => {
    const { code, transactionId } = req.params;
    const user = req.user;
    const result = await InvoiceService.voidManualPayment(code, transactionId, user.id);
    return successResponse(req, res, result, "Payment voided");
  });

  // Get a single invoice by ID
  static getInvoiceById = catchAsync(async (req, res, next) => {
    const { code } = req.params;
    const user = req.user;
    const invoice = await InvoiceService.getInvoiceById(code, user.id);
    return successResponse(req, res, invoice);
  });

  // Public, unauthenticated invoice view - what the payment link in the
  // invoice email/PDF actually resolves to.
  static getPublicInvoice = catchAsync(async (req, res, next) => {
    const { code } = req.params;
    const invoice = await InvoiceService.getPublicInvoice(code);
    return successResponse(req, res, invoice);
  });

  // Streams the rendered PDF straight back to the client - this is a binary
  // file response, not a JSON envelope, so it bypasses successResponse.
  static downloadInvoiceById = catchAsync(async (req, res, next) => {
    const { code } = req.params;
    const user = req.user;
    const { pdfBuffer, invoiceNumber } = await InvoiceService.downloadInvoiceById(code, user.id);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename=invoice_${invoiceNumber}.pdf`);
    return res.send(pdfBuffer);
  });

  // Update an invoice by ID (identified by its invoiceNumber/code, scoped to
  // the authenticated entity so one business can't touch another's invoice)
  static updateInvoice = catchAsync(async (req, res, next) => {
    const { code } = req.params;
    const user = req.user;
    const updatedData = req.body;
    const updatedInvoice = await InvoiceService.updateInvoice(code, updatedData, user.id);
    return successResponse(req, res, updatedInvoice);
  });

  // Delete an invoice by ID (same scoping as updateInvoice)
  static deleteInvoice = catchAsync(async (req, res, next) => {
    const { code } = req.params;
    const user = req.user;
    const deletedInvoice = await InvoiceService.deleteInvoice(code, user.id);
    return successResponse(req, res, deletedInvoice);
  });
}

module.exports = {
  InvoiceController,
};
