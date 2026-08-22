// Subscription tiers. Free tier is capped at 2 invoices/month and locked out
// of the 6 logo-enabled premium templates (see utils/templates/themes.js) -
// per the business direction, logo templates are the paid-upgrade hook.
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
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceNGN: 4500,
    maxInvoicesPerMonth: 20,
    allowPremiumTemplates: true,
  },
  business: {
    id: 'business',
    name: 'Business',
    priceNGN: 15000,
    maxInvoicesPerMonth: null, // unlimited
    allowPremiumTemplates: true,
  },
};

function getPlan(id) {
  return PLANS[id] || PLANS.free;
}

function listPlans() {
  return Object.values(PLANS);
}

module.exports = { PLANS, getPlan, listPlans };
