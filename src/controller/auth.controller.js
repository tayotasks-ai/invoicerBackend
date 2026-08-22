const catchAsync = require("../utils/catchAsync");
const { AuthService } = require("../services");
const { successResponse } = require("../utils/responder");
const httpStatus = require("http-status");

class AuthController {
  // Signup
  static signup = catchAsync(async (req, res, next) => {
    const {
      name,
      email,
      password,
      type,
      phone,
      first_name,
      last_name,
      logo,
      address,
    } = req.body;
    const entity = await AuthService.signup({
      name,
      email,
      password,
      type,
      phone,
      first_name,
      last_name,
      logo,
      address,
    });
    return successResponse(req, res, entity, "Successfully signed up");
  });

  static signIn = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;
    const entity = await AuthService.signIn(email, password);

    return successResponse(req, res, entity, "Successfully signed in");
  });
}

module.exports = {
  AuthController,
};
