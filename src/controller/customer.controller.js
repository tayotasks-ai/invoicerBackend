const catchAsync = require('../utils/catchAsync');
const { CustomerService } = require('../services');
const { successResponse } = require('../utils/responder');

class CustomerController {
  static getAllCustomers = catchAsync(async (req, res, next) => {
    const user = req.user;
    const customers = await CustomerService.getAllCustomers(user.id);
    return successResponse(req, res, customers, 'Operation Successful');
  });
}

module.exports = {
  CustomerController,
};
