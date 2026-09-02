const fs = require("fs");
const spendRepository = require("../repo/spend.repo");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;

class SpendService {
  static createSpend = async (data, entity_id) => {
    const spend = await spendRepository.create({
      ...data,
      entity: entity_id,
    });
    abortIf(!spend, httpStatus.BAD_REQUEST, "Error logging spend");
    return spend;
  };

  static getAllSpend = async (entity_id, filters = {}) => {
    const { category, search, startDate, endDate } = filters;
    const query = { entity: entity_id };
    if (category) query.category = { $in: category.split(",") };
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: "i" } },
        { payee: { $regex: search, $options: "i" } },
      ];
    }
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }
    return spendRepository.findAll({ query, sort: { date: -1 } });
  };

  static getSpendByCode = async (code, entity_id) => {
    const spend = await spendRepository.findOne({ query: { code, entity: entity_id } });
    abortIf(!spend, httpStatus.NOT_FOUND, "Spend record not found");
    return spend;
  };

  static updateSpend = async (code, data, entity_id) => {
    const existing = await SpendService.getSpendByCode(code, entity_id);
    const spend = await spendRepository.update(existing._id, data);
    abortIf(!spend, httpStatus.NOT_FOUND, "Spend record not found");
    return spend;
  };

  static deleteSpend = async (code, entity_id) => {
    const existing = await SpendService.getSpendByCode(code, entity_id);
    return spendRepository.delete(existing._id);
  };

  // Only real images, never an arbitrary file - same reasoning and same
  // list as EntityService._ALLOWED_IMAGE_MIMETYPES. Deliberately a separate
  // copy rather than importing EntityService's private helper: this is a
  // different document (Spend, not Entity) and keeping each service's file
  // handling self-contained matches how the rest of this codebase favors
  // small, independent services over shared cross-service helpers for
  // anything beyond email/template building.
  static _ALLOWED_IMAGE_MIMETYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

  static addReceipt = async ({ code, entity_id, file }) => {
    const existing = await SpendService.getSpendByCode(code, entity_id);
    abortIf(
      !SpendService._ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype),
      httpStatus.BAD_REQUEST,
      "Only PNG, JPEG, WebP or GIF images are allowed"
    );
    const base64 = fs.readFileSync(file.tempFilePath, { encoding: "base64" });
    fs.unlink(file.tempFilePath, () => {});
    const dataUri = `data:${file.mimetype};base64,${base64}`;
    const updated = await spendRepository.update(existing._id, { receipt: dataUri });
    return { receipt: updated.receipt };
  };

  // Backs the stat cards + category breakdown at the top of the Spending
  // list - this month's total/count, plus how much went to each category
  // this month (sorted highest first), so a business can see at a glance
  // where their money is actually going, not just how much left.
  static getSpendStats = async (entity_id) => {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const thisMonthSpend = await spendRepository.findAll({
      query: { entity: entity_id, date: { $gte: startOfThisMonth } },
      select: "amount currency category",
    });

    const total = thisMonthSpend.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const byCategoryMap = new Map();
    for (const s of thisMonthSpend) {
      byCategoryMap.set(s.category, (byCategoryMap.get(s.category) || 0) + Number(s.amount || 0));
    }
    const byCategory = Array.from(byCategoryMap.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    return {
      currency: thisMonthSpend[0]?.currency || "NGN",
      thisMonth: { total, count: thisMonthSpend.length },
      byCategory,
    };
  };
}

module.exports = { SpendService };
