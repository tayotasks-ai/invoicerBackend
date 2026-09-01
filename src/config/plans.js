// Subscription tiers. Free tier is capped at 2 invoices/month and locked out
// of the 6 logo-enabled premium templates (see utils/templates/themes.js) -
// per the business direction, logo templates are the paid-upgrade hook.
//
// allowReminders/allowQuotes/allowInventory/allowAccountantAccess were added
// after the marketing/pricing pages had already been advertising these as
// plan-exclusive features for a while with nothing actually enforcing that -
// every plan, including Free, could use all of them. This is what makes
// those claims true. Enforced at each feature's service-layer entry point
// (quote.service.js, inventory.service.js, accountant.service.js,
// reminder.service.js/invoice.service.js) rather than in a shared
// middleware, matching how maxInvoicesPerMonth/allowPremiumTemplates were
// already done - each feature is a different shape of "no" (a hard block on
// creating a quote vs. a silent skip in the reminder chaser), so a generic
// gate would have fought the existing pattern more than it helped.
//
// Real recurring billing would use Paystack's Subscription Plans API, which
// needs a plan created from the Paystack dashboard (not available in this
// environment). Until that's set up, `EntityService.subscribe` charges a
// single one-time transaction tagged with `metadata.purpose = 'subscription'`
// and the webhook upgrades `entity.plan` + sets `planRenewsAt` 30 days out on
// success - see utils.service.js's `_handleSubscriptionPayment`. Swapping
// this for true recurring billing later only touches those two call sites.
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceNGN: 0,
    maxInvoicesPerMonth: 2,
    allowPremiumTemplates: false,
    allowReminders: false,
    allowQuotes: false,
    allowInventory: false,
    allowAccountantAccess: false,
    allowRecurringInvoices: false,
  },
  // Low-friction entry tier sitting between Free and Growth's 18x price
  // jump - the goal is converting a free user into *any* paying customer,
  // since that's a much smaller ask than jumping straight to Growth, and a
  // paying customer is far easier to upsell later than a free one.
  // Deliberately identical to Free on every feature flag below, not just
  // templates - quota is Starter's only differentiator, so it feeds Growth
  // (which is where reminders/quotes actually unlock) rather than
  // cannibalizing it.
  starter: {
    id: 'starter',
    name: 'Starter',
    priceNGN: 1000,
    maxInvoicesPerMonth: 10,
    allowPremiumTemplates: false,
    allowReminders: false,
    allowQuotes: false,
    allowInventory: false,
    allowAccountantAccess: false,
    allowRecurringInvoices: false,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceNGN: 4500,
    maxInvoicesPerMonth: 20,
    allowPremiumTemplates: true,
    allowReminders: true,
    allowQuotes: true,
    allowInventory: false,
    allowAccountantAccess: false,
    // Same tier as reminders/quotes - a business that can't chase payments
    // yet doesn't get automated billing either.
    allowRecurringInvoices: true,
  },
  business: {
    id: 'business',
    name: 'Business',
    priceNGN: 15000,
    maxInvoicesPerMonth: null, // unlimited
    allowPremiumTemplates: true,
    allowReminders: true,
    allowQuotes: true,
    allowInventory: true,
    allowAccountantAccess: true,
    allowRecurringInvoices: true,
  },
};

function getPlan(id) {
  return PLANS[id] || PLANS.free;
}

function listPlans() {
  return Object.values(PLANS);
}

module.exports = { PLANS, getPlan, listPlans };
