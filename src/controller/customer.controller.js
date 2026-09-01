const catchAsync = require('../utils/catchAsync');
const { CustomerService } = require('../services');
const { successResponse } = require('../utils/responder');

class CustomerController {
  static getAllCustomers = catchAsync(async (req, res, next) => {
    const user = req.user;
    const customers = await CustomerService.getAllCustomers(user.id);
    return successResponse(req, res, customers, 'Operation Successful');
  });

  static exportCsv = catchAsync(async (req, res, next) => {
    const user = req.user;
    const csv = await CustomerService.exportCustomersCsv(user.id);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="customers.csv"');
    return res.send(csv);
  });

  static getCustomerByCode = catchAsync(async (req, res, next) => {
    const user = req.user;
    const customer = await CustomerService.getCustomerByCode(req.params.code, user.id);
    return successResponse(req, res, customer, 'Operation Successful');
  });

  static getCustomerStatement = catchAsync(async (req, res, next) => {
    const user = req.user;
    const statement = await CustomerService.getCustomerStatement(req.params.code, user.id);
    return successResponse(req, res, statement, 'Operation Successful');
  });

  static downloadCustomerStatement = catchAsync(async (req, res, next) => {
    const user = req.user;
    const { pdfBuffer, customerName } = await CustomerService.downloadCustomerStatement(req.params.code, user.id);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="statement_${customerName.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
    return res.send(pdfBuffer);
  });
}

module.exports = {
  CustomerController,
};
