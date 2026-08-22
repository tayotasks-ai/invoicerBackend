const catchAsync = require("../utils/catchAsync");
const { QuoteService } = require("../services");
const { successResponse } = require("../utils/responder");

class QuoteController {
  static createQuote = catchAsync(async (req, res) => {
    const quote = await QuoteService.createQuote(req.body, req.user.id);
    return successResponse(req, res, quote, "Quote created");
  });

  static getAllQuotes = catchAsync(async (req, res) => {
    const quotes = await QuoteService.getAllQuotes(req.user.id, req.query);
    return successResponse(req, res, quotes);
  });

  static getQuoteById = catchAsync(async (req, res) => {
    const quote = await QuoteService.getQuoteById(req.params.code, req.user.id);
    return successResponse(req, res, quote);
  });

  // Public, unauthenticated - the link emailed to the customer.
  static getPublicQuote = catchAsync(async (req, res) => {
    const quote = await QuoteService.getPublicQuote(req.params.code);
    return successResponse(req, res, quote);
  });

  // Public, unauthenticated - the customer accepting/rejecting from that
  // same page.
  static respondToQuote = catchAsync(async (req, res) => {
    const { response } = req.body;
    const quote = await QuoteService.respondToQuote(req.params.code, response);
    return successResponse(req, res, quote, `Quote ${response}`);
  });

  static downloadQuoteById = catchAsync(async (req, res) => {
    const { pdfBuffer, quoteNumber } = await QuoteService.downloadQuoteById(req.params.code, req.user.id);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `attachment; filename=quote_${quoteNumber}.pdf`);
    return res.send(pdfBuffer);
  });

  static updateQuote = catchAsync(async (req, res) => {
    const quote = await QuoteService.updateQuote(req.params.code, req.body, req.user.id);
    return successResponse(req, res, quote);
  });

  static deleteQuote = catchAsync(async (req, res) => {
    const quote = await QuoteService.deleteQuote(req.params.code, req.user.id);
    return successResponse(req, res, quote);
  });

  // The headline feature: turn this quote into a real invoice.
  static convertToInvoice = catchAsync(async (req, res) => {
    const invoice = await QuoteService.convertToInvoice(req.params.code, req.user.id);
    return successResponse(req, res, invoice, "Quote converted to invoice");
  });
}

module.exports = {
  QuoteController,
};
