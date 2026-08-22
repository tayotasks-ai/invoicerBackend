const catchAsync = require("../utils/catchAsync");
const { AccountantService } = require("../services");
const { successResponse } = require("../utils/responder");

class AccountantController {
  // Business invites someone (by email) to access its books.
  static inviteAccountant = catchAsync(async (req, res) => {
    const { email } = req.body;
    const result = await AccountantService.inviteAccountant(req.user.id, email);
    return successResponse(req, res, result, "Invite sent");
  });

  // Public, unauthenticated - the accept page reads this before the visitor
  // has necessarily signed in.
  static getInviteByToken = catchAsync(async (req, res) => {
    const invite = await AccountantService.getInviteByToken(req.params.token);
    return successResponse(req, res, invite);
  });

  // The accountant, authenticated as themselves, accepting the invite.
  // Deliberately uses the REAL caller identity (req.actingAccountant.id if
  // a workspace switch is in effect, else req.user.id) rather than
  // whichever business might currently be acted-as - accepting an invite
  // always attaches to the actual logged-in account, never to a client
  // business the accountant happens to be viewing at the moment. See
  // authorization.service.js's authenticateToken for how req.actingAccountant
  // gets set.
  static acceptInvite = catchAsync(async (req, res) => {
    const realId = req.actingAccountant?.id || req.user.id;
    const access = await AccountantService.acceptInvite(req.params.token, realId);
    return successResponse(req, res, access, "Invite accepted");
  });

  // For the accountant: every business they can act as. Same
  // real-identity-only reasoning as acceptInvite above - this must always
  // reflect the actual logged-in account's own access grants, not
  // whichever client business is currently active, or the workspace
  // switcher would go blank/wrong the moment you switch into a client.
  static listMyBusinesses = catchAsync(async (req, res) => {
    const realId = req.actingAccountant?.id || req.user.id;
    const businesses = await AccountantService.listMyBusinesses(realId);
    return successResponse(req, res, businesses);
  });

  // For the business: everyone with (or pending) access to its books.
  static listMyAccountants = catchAsync(async (req, res) => {
    const accountants = await AccountantService.listMyAccountants(req.user.id);
    return successResponse(req, res, accountants);
  });

  static revokeAccess = catchAsync(async (req, res) => {
    const access = await AccountantService.revokeAccess(req.params.accessId, req.user.id);
    return successResponse(req, res, access, "Access revoked");
  });
}

module.exports = {
  AccountantController,
};
