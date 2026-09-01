const httpStatus = require("http-status").default;
const { abortIf } = require("../utils/responder");
const entityRepository = require("../repo/entity.repo");
const invoiceRepository = require("../repo/invoice.repo");
const expenseRepository = require("../repo/expense.repo");
const customerRepository = require("../repo/customer.repo");
const { getPlan, listPlans } = require("../config/plans");

// The root panel's backend. There is no separate root login here - access
// is gated entirely by Authorization.requireRoot (an email allowlist
// checked on an ordinary business JWT, see authorization.service.js) at the
// route layer, so nothing in this service needs to know about auth at all.
class AdminService {
  // "Merchant" means a top-level business account, not a staff sub-account
  // (type: 'staff', see entity.model.js) - staff logins aren't managed here.
  static listMerchants = async ({ q, plan, flag, page, limit }) => {
    const query = { type: "business" };
    if (q) {
      const escaped = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "i");
      query.$or = [{ name: re }, { email: re }];
    }
    if (plan) query.plan = plan;
    if (flag === "test") query.isTestMerchant = true;
    if (flag === "suspended") query.isSuspended = true;

    return entityRepository.paginate({
      query,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      sort: { createdAt: -1 },
      select: "code name email plan isTestMerchant isSuspended emailVerified createdAt virtualAccount",
    });
  };

  static _findByCode = async (code) => {
    const entity = await entityRepository.findOne({ query: { code, type: "business" } });
    abortIf(!entity, httpStatus.NOT_FOUND, "Merchant not found");
    return entity;
  };

  // At-a-glance detail for one merchant - their own plan/flags plus enough
  // counts to orient support/testing without leaving this page.
  static getMerchant = async (code) => {
    const entity = await AdminService._findByCode(code);
    const [invoiceCount, expenseCount, customerCount] = await Promise.all([
      invoiceRepository.countDocuments({ entity: entity._id }),
      expenseRepository.countDocuments({ entity: entity._id }),
      customerRepository.countDocuments({ entity: entity._id }),
    ]);
    return { ...entity.toJSON(), invoiceCount, expenseCount, customerCount };
  };

  static setTestFlag = async (code, enabled) => {
    const entity = await AdminService._findByCode(code);
    return entityRepository.update(entity._id, { isTestMerchant: !!enabled });
  };

  static suspend = async (code, reason) => {
    const entity = await AdminService._findByCode(code);
    return entityRepository.update(entity._id, {
      isSuspended: true,
      suspendedAt: new Date(),
      suspendedReason: reason || null,
    });
  };

  static unsuspend = async (code) => {
    const entity = await AdminService._findByCode(code);
    return entityRepository.update(entity._id, {
      isSuspended: false,
      suspendedAt: null,
      suspendedReason: null,
    });
  };

  // Manually moves a merchant onto a different plan, bypassing the Paystack
  // subscription flow entirely - for comps, support, or fixing a stuck
  // webhook. `plan` is validated against the real plan catalogue (not just
  // "is this a non-empty string") so this can't put an entity into a plan
  // id that config/plans.js doesn't recognize.
  static changePlan = async (code, planId) => {
    const validIds = listPlans().map((p) => p.id);
    abortIf(!validIds.includes(planId), httpStatus.BAD_REQUEST, `Unknown plan "${planId}"`);
    const entity = await AdminService._findByCode(code);
    return entityRepository.update(entity._id, { plan: planId });
  };
}

module.exports = { AdminService };
