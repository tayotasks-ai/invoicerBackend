var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var crypto = require('crypto'); // Assuming you're using Node's built-in crypto module
var { THEMES, DEFAULT_THEME_ID } = require('../utils/templates/themes');

var entitySchema = new Schema({
  code: {
    type: String, // You can also use Schema.Types.String if UUIDs are stored as strings
    default: function () {
      return 'ent_' + crypto.randomUUID().split('-').join('').slice(0, 15); // Replaced arrow function with a regular function
    }
  },
  parent_id: {
    type: String,
    ref: 'Entity',
    default: null
  },
  name: {
    type: String,
    required: true
  },
  first_name: String,
  last_name: String,
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    unique: true,
    sparse: true // helps with optional unique fields
  },
  password: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['business', 'staff'],
    required: true
  },
  logo: String,
  signature: String,
  address: String,
  // Which of the 12 invoice designs (utils/templates/themes.js) this
  // business's invoices render with. Premium (logo-enabled) themes are
  // gated behind `plan` in entity.service.js's editEntity.
  invoiceTemplate: {
    type: String,
    enum: THEMES.map(function (t) { return t.id; }),
    default: DEFAULT_THEME_ID
  },
  // Subscription tier - see src/config/plans.js. `planRenewsAt` is
  // informational only for now (no auto-downgrade job yet); it's set by the
  // subscription webhook handler in utils.service.js.
  plan: {
    type: String,
    enum: ['free', 'growth', 'business'],
    default: 'free'
  },
  planRenewsAt: {
    type: Date,
    default: null
  },
  // Tax Identification Number - required by FIRS's e-invoicing platform to
  // identify the seller on every submitted invoice (see
  // src/services/firs.service.js). Collected ahead of that integration
  // going live so businesses aren't blocked entering it later.
  tin: {
    type: String,
    default: null
  },
  // Per-invoice WhatsApp reminders default on; a business can turn them off
  // entirely here without touching individual invoices. See
  // src/services/reminder.service.js.
  whatsappRemindersEnabled: {
    type: Boolean,
    default: true
  },
  resetToken: {
    type: String,
    default: null
  },
  resetTokenExpiry: {
    type: Date,
    default: null
  },
  // Soft verification only - see AuthService.signup/verifyEmail. Nothing in
  // the app currently blocks on this being false (no gated features, login
  // still works) - it's surfaced as a dismissible-ish banner in the
  // dashboard with a resend action. Deliberately not enforced harder than
  // that: blocking login/signup on email delivery would mean an
  // unconfigured or misbehaving Resend account (see sample/.env - it's
  // optional everywhere else in this codebase) could lock genuine
  // businesses out entirely, which is a worse failure mode than a business
  // just not verifying.
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  // Dedicated bank account for the Expenses/Accounts Payable feature,
  // provisioned via Seerbit - see EntityService.provisionVirtualAccount and
  // src/utils/seerbit.utils.js. Provisioning only for now; paying vendors
  // automatically from this account isn't built yet.
  //
  // Deliberately has NO bvn field. The BVN a business enters to activate
  // this is forwarded straight to Seerbit in that one request and never
  // persisted here - see provisionVirtualAccount for why.
  virtualAccount: {
    provider: {
      type: String,
      enum: ['seerbit'],
      default: null
    },
    status: {
      type: String,
      enum: ['active', 'failed'],
      default: null
    },
    accountNumber: { type: String, default: null },
    bankName: { type: String, default: null },
    accountName: { type: String, default: null },
    reference: { type: String, default: null },
    error: { type: String, default: null },
    createdAt: { type: Date, default: null }
  },
  // Root-panel controls (see admin.service.js / views/RootMerchant*.vue).
  // Neither field is settable from anywhere a business itself can reach -
  // only the /admin/* routes (Authorization.requireRoot) touch these, and
  // editEntitySchema (entity.validations.js) doesn't allow either key
  // through the business's own PATCH /entity endpoint.
  //
  // isTestMerchant: unlocks every plan-gated feature for this business
  // regardless of `plan` (see config/plans.js's effectivePlanId) - for
  // end-to-end testing a real merchant account without needing them to
  // actually pay for the Business tier.
  isTestMerchant: {
    type: Boolean,
    default: false
  },
  // isSuspended blocks future sign-ins (AuthService.signIn) but does NOT
  // invalidate an already-issued JWT - a session active at the moment of
  // suspension keeps working until that token naturally expires (see
  // JWT_EXPIRES_IN). Deliberate scope: this is a "stop new logins" switch,
  // not real-time session revocation, which would need a per-request DB
  // lookup on every authenticated call.
  isSuspended: {
    type: Boolean,
    default: false
  },
  suspendedAt: {
    type: Date,
    default: null
  },
  suspendedReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function (doc, ret) {
      delete ret.password; // Remove password field from the output
      return ret;
    }
  }
});

// Virtuals
entitySchema.virtual('staff', {
  ref: 'Entity',
  localField: '_id',
  foreignField: 'parent_id'
});

entitySchema.virtual('roleEntities', {
  ref: 'RoleEntity',
  localField: '_id',
  foreignField: 'entity_id',
  justOne: true
});

var Entity = mongoose.model('Entity', entitySchema);

module.exports = Entity;
