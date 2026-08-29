const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Entity = require("../models/entity.model");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const entityRepository = require("../repo/entity.repo");
const jwt = require("jsonwebtoken");
const Authorization = require("../utils/authorization.service");
const { sendEmail } = require("../utils/email.util");

// A reset link is only useful for a short window - long enough for someone
// to actually check their email, short enough that an old, unused link
// lying around in an inbox stops being a risk.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

class AuthService {
  // Public self-signup always creates the tenant-root "business" entity, not
  // a staff member - staff accounts are only ever created via
  // EntityService.addMember (see entity.service.js), which explicitly passes
  // type: "staff" and a parent_id. Defaulting this to "staff" would create
  // parentless staff accounts with no owning business, which is meaningless.
  static signup = async ({
    name,
    email,
    password,
    type = "business",
    phone,
    first_name,
    last_name,
    logo,
    address,
  }) => {
    const existingEntity = await entityRepository.findOne({ query: { email } });
    abortIf(existingEntity, httpStatus.BAD_REQUEST, "Entity already exists");
    const hashedPassword = await bcrypt.hash(password, 10);
    const emailVerificationToken = crypto.randomBytes(24).toString("hex");
    const entity = await entityRepository.create({
      name,
      email,
      password: hashedPassword,
      type,
      phone,
      first_name,
      last_name,
      logo,
      address,
      emailVerificationToken,
    });

    // Best-effort, never blocks signup - a business should get an account
    // whether or not email happens to be configured/working right now (see
    // sendEmail's own comment - this is the same "fail open" treatment as
    // every other email in this app). One email covers both the welcome
    // message and the verification link rather than sending two back to
    // back for the same signup.
    const verifyLink = `${process.env.APP_URL || ""}/verify-email/${emailVerificationToken}`;
    sendEmail({
      to: entity.email,
      subject: `Welcome to invoecr, ${entity.name}`,
      html: `<p>Hi ${entity.first_name || entity.name},</p>
<p>Welcome to invoecr - you're all set to start creating invoices.</p>
<p>Before anything else, please confirm this is your email address:</p>
<p><a href="${verifyLink}">Verify my email</a></p>
<p style="color:#888;font-size:12px;">If you didn't create this account, you can ignore this email.</p>`,
    }).catch((error) => console.error("Failed to send welcome/verification email:", error.message));

    //generate token
    // NOTE: Authorization.generateToken() returns {success, token, expiresIn},
    // not a bare JWT string - unwrap .token here, otherwise the frontend ends
    // up storing "[object Object]" as its auth token, which fails
    // verification on the very next request and looks like an instant logout.
    const { token } = Authorization.generateToken({
      id: entity._id,
      email: entity.email,
    });
    return { entity, token };
  };
  static signIn = async (email, password) => {
    const entity = await entityRepository.findOne({ query: { email } });
    abortIf(!entity, httpStatus.NOT_FOUND, "Entity not found");
    const isMatch = await bcrypt.compare(password, entity.password);
    abortIf(!isMatch, httpStatus.BAD_REQUEST, "Invalid credentials");
    const { token } = Authorization.generateToken({
      id: entity._id,
      email: entity.email,
    });
    return { entity, token };
  };

  // Deliberately silent about whether the email exists - responding
  // differently for "no account with that email" vs "reset email sent"
  // lets an attacker enumerate registered emails. The controller always
  // returns the same generic message regardless of what this resolves to.
  static forgotPassword = async (email) => {
    const entity = await entityRepository.findOne({ query: { email } });
    if (!entity) return;

    const resetToken = crypto.randomBytes(24).toString("hex");
    await entityRepository.update(entity._id, {
      resetToken,
      resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    const resetLink = `${process.env.APP_URL || ""}/reset-password/${resetToken}`;
    await sendEmail({
      to: entity.email,
      subject: "Reset your invoecr password",
      html: `<p>Hi ${entity.first_name || entity.name},</p>
<p>We got a request to reset your invoecr password. This link expires in 1 hour:</p>
<p><a href="${resetLink}">Reset my password</a></p>
<p style="color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email - your password won't change.</p>`,
    }).catch((error) => console.error("Failed to send password reset email:", error.message));
  };

  // The token is the only credential here (same "possession of the link is
  // the credential" model as accountant invites/payment links) - whoever
  // clicks a valid, unexpired link can set a new password. Auto-signs the
  // user in afterwards (same shape as signIn/signup) so a successful reset
  // drops them straight into the dashboard instead of a second login step.
  static resetPassword = async (token, password) => {
    const entity = await entityRepository.findOne({
      query: { resetToken: token, resetTokenExpiry: { $gt: new Date() } },
    });
    abortIf(
      !entity,
      httpStatus.BAD_REQUEST,
      "This password reset link is invalid or has expired. Request a new one."
    );
    const hashedPassword = await bcrypt.hash(password, 10);
    const updated = await entityRepository.update(entity._id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    });
    const { token: authToken } = Authorization.generateToken({
      id: updated._id,
      email: updated.email,
    });
    return { entity: updated, token: authToken };
  };

  // Public (unauthenticated) - the link in the welcome email. Soft
  // verification only, see entity.model.js's comment: this never blocks
  // login, it just flips the flag the dashboard banner checks.
  static verifyEmail = async (token) => {
    const entity = await entityRepository.findOne({
      query: { emailVerificationToken: token },
    });
    abortIf(
      !entity,
      httpStatus.BAD_REQUEST,
      "This verification link is invalid or has already been used."
    );
    const updated = await entityRepository.update(entity._id, {
      emailVerified: true,
      emailVerificationToken: null,
    });
    return updated;
  };

  // Authenticated - for the "Resend verification email" action on the
  // dashboard banner. Reuses/regenerates the token on the caller's own
  // account rather than accepting an arbitrary email, so this can't be used
  // to spam someone else's inbox.
  static resendVerificationEmail = async (entityId) => {
    const entity = await entityRepository.findById(entityId);
    abortIf(!entity, httpStatus.NOT_FOUND, "Entity not found");
    if (entity.emailVerified) return entity;

    const emailVerificationToken = crypto.randomBytes(24).toString("hex");
    const updated = await entityRepository.update(entity._id, { emailVerificationToken });
    const verifyLink = `${process.env.APP_URL || ""}/verify-email/${emailVerificationToken}`;
    await sendEmail({
      to: updated.email,
      subject: "Verify your invoecr email address",
      html: `<p>Hi ${updated.first_name || updated.name},</p>
<p>Please confirm this is your email address:</p>
<p><a href="${verifyLink}">Verify my email</a></p>`,
    }).catch((error) => console.error("Failed to resend verification email:", error.message));
    return updated;
  };
}

module.exports = {
  AuthService,
};
