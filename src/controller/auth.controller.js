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

  // Always responds the same way regardless of whether the email matches an
  // account - see AuthService.forgotPassword's comment on why (prevents
  // using this endpoint to enumerate registered emails).
  static forgotPassword = catchAsync(async (req, res, next) => {
    const { email } = req.body;
    await AuthService.forgotPassword(email);
    return successResponse(
      req,
      res,
      {},
      "If an account exists for that email, a reset link has been sent."
    );
  });

  static resetPassword = catchAsync(async (req, res, next) => {
    const { token, password } = req.body;
    const result = await AuthService.resetPassword(token, password);
    return successResponse(req, res, result, "Password reset - you're signed in.");
  });

  static verifyEmail = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const entity = await AuthService.verifyEmail(token);
    return successResponse(req, res, entity, "Email verified");
  });

  static resendVerification = catchAsync(async (req, res, next) => {
    const user = req.user;
    const entity = await AuthService.resendVerificationEmail(user.id);
    return successResponse(req, res, entity, "Verification email sent");
  });
}

module.exports = {
  AuthController,
};
