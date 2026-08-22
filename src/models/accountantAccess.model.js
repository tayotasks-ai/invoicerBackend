var mongoose = require('mongoose');
var crypto = require('crypto');
var Schema = mongoose.Schema;

// Grants one Entity ("accountant" - any existing invoecr account, business
// or otherwise; there's no separate accountant account type) the ability to
// act as another Entity ("business") without a second login. See
// authorization.service.js's authenticateToken for how an active grant is
// actually exercised (the `x-business-id` header workspace switch), and
// accountant.service.js for the invite/accept/revoke flow that creates and
// manages these records.
var accountantAccessSchema = new Schema({
  // Null until the invite is accepted - we don't know which Entity is
  // accepting until they actually do, since the invite is addressed to an
  // email, not necessarily an existing account.
  accountant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    default: null,
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
  },
  invitedEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  // 'pending' - invited, not yet accepted. 'active' - accepted, grant is
  // live. 'revoked' - either side ended it; kept (not deleted) as a record
  // of past access rather than silently disappearing.
  status: {
    type: String,
    enum: ['pending', 'active', 'revoked'],
    default: 'pending',
  },
  // Unguessable token, same pattern as invoice/quote's public-link codes -
  // whoever holds the invite link/token can accept it. Not scoped further
  // (e.g. to the invited email matching the accepting account) for the same
  // reason invoice payment links aren't either: simplicity, matching this
  // codebase's existing "possession of the link is the credential" model.
  inviteToken: {
    type: String,
    required: true,
    default: function () {
      return crypto.randomBytes(24).toString('hex');
    },
    unique: true,
  },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

accountantAccessSchema.index({ business: 1, accountant: 1 });
accountantAccessSchema.index({ accountant: 1, status: 1 });

module.exports = mongoose.model('AccountantAccess', accountantAccessSchema);
