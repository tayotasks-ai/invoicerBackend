const httpStatus = require("http-status").default;
const { abortIf } = require("../utils/responder");
const accountantAccessRepo = require("../repo/accountantAccess.repo");
const entityRepository = require("../repo/entity.repo");
const { sendEmail } = require("../utils/email.util");
const { getPlan } = require("../config/plans");
const { buildEmailHtml, esc } = require("../utils/templates/emailLayout");

class AccountantService {
  // Business owner invites an accountant (or bookkeeper, or anyone they
  // want managing their books) by email. If that email doesn't have an
  // invoecr account yet, that's fine - the invite is just addressed to the
  // email; whoever eventually accepts the link (after signing up/in with
  // that access) is who gets linked as `accountant`. Returns the invite
  // link directly in the response (in addition to a best-effort email) so
  // the flow works even with email (Resend) unconfigured, same "always
  // return it, email is a nice-to-have" pattern as EntityService.addMember's
  // tempPassword.
  static inviteAccountant = async (businessEntityId, email) => {
    const business = await entityRepository.findById(businessEntityId);
    abortIf(!business, httpStatus.BAD_REQUEST, "Invalid Entity Id");
    abortIf(
      !getPlan(business.plan).allowAccountantAccess,
      httpStatus.FORBIDDEN,
      "Accountant/bookkeeper access is a Business-plan feature. Upgrade your plan to invite one."
    );

    const invitedEmail = String(email).toLowerCase().trim();
    abortIf(
      invitedEmail === business.email,
      httpStatus.BAD_REQUEST,
      "You can't invite yourself"
    );

    // Re-use an existing pending invite to the same email rather than
    // stacking up duplicates every time the business clicks "invite" again.
    let access = await accountantAccessRepo.findOne({
      query: { business: businessEntityId, invitedEmail, status: "pending" },
    });
    if (!access) {
      access = await accountantAccessRepo.create({
        business: businessEntityId,
        invitedEmail,
      });
    }

    const inviteLink = `${process.env.APP_URL || ""}/accept-accountant-invite/${access.inviteToken}`;
    sendEmail({
      to: invitedEmail,
      subject: `${business.name} invited you to manage their books on invoecr`,
      html: buildEmailHtml({
        preheader: `${business.name} invited you to access their invoecr account.`,
        heading: `${esc(business.name)} invited you`,
        bodyHtml: `<p style="margin:0;">${esc(business.name)} has invited you to access their invoecr account as an accountant/bookkeeper.</p>`,
        cta: { label: "Accept invite", url: inviteLink },
      }),
    }).catch((error) => console.error("Failed to email accountant invite:", error.message));

    return { access, inviteLink };
  };

  // Public, unauthenticated lookup - lets the accept page show "You've been
  // invited to access {businessName}'s books" before the visitor has
  // necessarily signed in yet.
  static getInviteByToken = async (token) => {
    const access = await accountantAccessRepo.findOne({
      query: { inviteToken: token },
      populate: [{ path: "business", select: "name" }],
    });
    abortIf(!access, httpStatus.NOT_FOUND, "Invite not found");
    return {
      businessName: access.business?.name,
      invitedEmail: access.invitedEmail,
      status: access.status,
    };
  };

  // The accountant accepts, while authenticated as themselves (their own
  // existing invoecr account, or a fresh one they just signed up for). Any
  // authenticated account holding the token can accept it - same
  // possession-based trust model as the token itself (see the model file's
  // comment) - this deliberately does not require the invitedEmail to match
  // the accepting account's email, so a business can invite a colleague by
  // whatever email they know them by even if that person signs up with a
  // different one.
  static acceptInvite = async (token, accountantEntityId) => {
    const access = await accountantAccessRepo.findOne({ query: { inviteToken: token } });
    abortIf(!access, httpStatus.NOT_FOUND, "Invite not found");
    abortIf(
      access.status !== "pending",
      httpStatus.BAD_REQUEST,
      access.status === "active"
        ? "This invite has already been accepted"
        : "This invite is no longer valid"
    );
    abortIf(
      String(access.business) === String(accountantEntityId),
      httpStatus.BAD_REQUEST,
      "You can't accept an invite to your own business"
    );
    const updated = await accountantAccessRepo.update(access._id, {
      accountant: accountantEntityId,
      status: "active",
      acceptedAt: new Date(),
    });
    return updated;
  };

  // For the accountant: every business they can currently act as, so the
  // frontend workspace switcher has something to list. Only 'active' grants
  // - a still-pending invite the accountant hasn't accepted yet (or one
  // addressed to an email they haven't claimed) doesn't grant access.
  static listMyBusinesses = async (accountantEntityId) => {
    return accountantAccessRepo.findAll({
      query: { accountant: accountantEntityId, status: "active" },
      populate: [{ path: "business", select: "name email logo" }],
      sort: { createdAt: -1 },
    });
  };

  // For the business: everyone who currently has (or has been invited to
  // have) access to their books, so they can see and manage/revoke it.
  static listMyAccountants = async (businessEntityId) => {
    return accountantAccessRepo.findAll({
      query: { business: businessEntityId, status: { $in: ["pending", "active"] } },
      populate: [{ path: "accountant", select: "name email" }],
      sort: { createdAt: -1 },
    });
  };

  // Either side of the relationship can end it: the business revoking an
  // accountant's access, or the accountant themselves choosing to drop a
  // client. Scoped so a third party can never revoke a grant they're not
  // part of.
  static revokeAccess = async (accessId, requestingEntityId) => {
    const access = await accountantAccessRepo.findById(accessId);
    abortIf(!access, httpStatus.NOT_FOUND, "Access grant not found");
    const isParty =
      String(access.business) === String(requestingEntityId) ||
      String(access.accountant) === String(requestingEntityId);
    abortIf(!isParty, httpStatus.FORBIDDEN, "You don't have permission to revoke this access grant");
    const updated = await accountantAccessRepo.update(access._id, {
      status: "revoked",
      revokedAt: new Date(),
    });
    return updated;
  };

  // Called from authorization.service.js on every request that carries an
  // `x-business-id` header - the actual enforcement point for "can this
  // accountant act as this business right now". Kept here (not duplicated
  // in the middleware) so the one rule of what counts as valid access lives
  // in one place.
  static hasActiveAccess = async (accountantEntityId, businessEntityId) => {
    const access = await accountantAccessRepo.findOne({
      query: {
        accountant: accountantEntityId,
        business: businessEntityId,
        status: "active",
      },
    });
    return !!access;
  };
}

module.exports = {
  AccountantService,
};
