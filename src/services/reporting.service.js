const mongoose = require("mongoose");
const invoiceRepository = require("../repo/invoice.repo");
const transactionRepo = require("../repo/transaction.repo");
const customerRepository = require("../repo/customer.repo");

// How many months of history the trend chart covers, including the current
// (in-progress) month.
const TREND_MONTHS = 12;
// Invoices in these statuses still have money owed on them - "outstanding"
// and "aging" are both computed over exactly this set. Deliberately excludes
// 'draft' (never sent, so nothing is actually owed yet) and 'paid'.
const UNPAID_STATUSES = ["sent", "partially-paid", "overdue"];

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Percentage change from `previous` to `current`, the usual "vs last month"
// figure. `previous === 0` is treated as "no baseline to compare against"
// rather than a divide-by-zero - a fresh business's first month of revenue
// isn't a meaningful "+Infinity%".
function pctChange(current, previous) {
  if (!previous) return current > 0 ? null : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function daysBetween(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// Which aging bucket an invoice's balance falls into, based on how many days
// past its due date "now" is. An invoice with no dueDate at all is treated as
// "current" - there's nothing to be overdue against.
function agingBucket(dueDate, now) {
  if (!dueDate) return "current";
  const daysPastDue = daysBetween(now, new Date(dueDate));
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

class ReportingService {
  // Backs the dashboard's financial overview - real aggregates across *all*
  // of an entity's invoices/transactions, computed server-side. This is
  // deliberately a separate service from InvoiceService: it reads
  // invoices/transactions but never mutates either, and every number here is
  // a read-only rollup rather than part of the invoice lifecycle.
  //
  // Four pieces, fetched in parallel then combined in JS (kept out of the
  // aggregation pipelines themselves so the logic here is easy to follow and
  // to unit-test without a live Mongo instance):
  //   - revenueTrend: last 12 months, collected (money actually received)
  //     vs invoiced (money billed), one point per month.
  //   - cashFlow: this month vs last month collected/invoiced (with %
  //     change), plus right-now snapshots of outstanding and overdue.
  //   - topCustomers: the 5 customers who've paid the most, all-time.
  //   - aging: unpaid invoices bucketed by how overdue they are.
  //
  // Known simplification: like the rest of this codebase (see
  // InvoiceService.initiatePayment, which always creates NGN transactions
  // regardless of the invoice's own currency), this doesn't split figures by
  // currency - it reports one representative currency for display alongside
  // raw totals. Fine for the overwhelming NGN-only common case; a business
  // genuinely mixing currencies would see them summed together.
  static getOverview = async (entity_id) => {
    const entityObjectId = new mongoose.Types.ObjectId(entity_id);
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfTrendWindow = new Date(now.getFullYear(), now.getMonth() - (TREND_MONTHS - 1), 1);

    const [
      collectedByMonthRaw,
      invoicedByMonthRaw,
      unpaidInvoices,
      topCustomersRaw,
      currencyInvoice,
    ] = await Promise.all([
      // Money actually received, grouped by the month it was received in.
      transactionRepo.aggregate([
        {
          $match: {
            entity: entityObjectId,
            status: "SUCCESS",
            createdAt: { $gte: startOfTrendWindow },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            total: { $sum: "$amount" },
          },
        },
      ]),
      // Money billed (any invoice actually sent, regardless of whether it's
      // been paid yet), grouped by the month it was issued in.
      invoiceRepository.aggregate([
        {
          $match: {
            entity: entityObjectId,
            status: { $ne: "draft" },
            issueDate: { $gte: startOfTrendWindow },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$issueDate" } },
            total: { $sum: "$total" },
          },
        },
      ]),
      // Every currently-unpaid invoice, once - this backs outstanding,
      // overdue, and the aging breakdown, all three of which are just
      // different ways of slicing this same set.
      invoiceRepository.findAll({
        query: { entity: entity_id, status: { $in: UNPAID_STATUSES } },
        select: "total amountPaid dueDate",
      }),
      // Top 5 customers by total collected, all-time.
      transactionRepo.aggregate([
        { $match: { entity: entityObjectId, status: "SUCCESS" } },
        {
          $group: {
            _id: "$customer",
            totalCollected: { $sum: "$amount" },
            invoiceIds: { $addToSet: "$invoice" },
          },
        },
        { $sort: { totalCollected: -1 } },
        { $limit: 5 },
      ]),
      // One representative currency for display - whatever the business's
      // most recent real (non-draft) invoice was issued in. Defaults to NGN
      // (the vast majority case) if they have no invoices yet.
      invoiceRepository.findOne({
        query: { entity: entity_id, status: { $ne: "draft" } },
        select: "currency",
        sort: { issueDate: -1 },
      }),
    ]);

    // --- Revenue trend: 12 fixed months, zero-filled where there's no data,
    // rather than however many distinct months happened to have activity -
    // a chart with gaps for quiet months would misread as missing data.
    const collectedByMonth = new Map(collectedByMonthRaw.map((r) => [r._id, r.total]));
    const invoicedByMonth = new Map(invoicedByMonthRaw.map((r) => [r._id, r.total]));
    const revenueTrend = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(monthDate);
      revenueTrend.push({
        month: key,
        label: monthLabel(monthDate),
        collected: collectedByMonth.get(key) || 0,
        invoiced: invoicedByMonth.get(key) || 0,
      });
    }

    // --- Cash flow: this month vs last month is just two points already
    // sitting in the trend series above - no need to query again.
    const thisMonthPoint = revenueTrend[revenueTrend.length - 1];
    const lastMonthPoint = revenueTrend[revenueTrend.length - 2] || { collected: 0, invoiced: 0 };

    let outstandingTotal = 0;
    let overdueTotal = 0;
    let overdueCount = 0;
    const agingTotals = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const agingCounts = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const invoice of unpaidInvoices) {
      const balance = Math.max(Number(invoice.total || 0) - Number(invoice.amountPaid || 0), 0);
      outstandingTotal += balance;
      const bucket = agingBucket(invoice.dueDate, now);
      agingTotals[bucket] += balance;
      agingCounts[bucket] += 1;
      if (bucket !== "current") {
        overdueTotal += balance;
        overdueCount += 1;
      }
    }

    const cashFlow = {
      collected: {
        current: thisMonthPoint.collected,
        previous: lastMonthPoint.collected,
        changePct: pctChange(thisMonthPoint.collected, lastMonthPoint.collected),
      },
      invoiced: {
        current: thisMonthPoint.invoiced,
        previous: lastMonthPoint.invoiced,
        changePct: pctChange(thisMonthPoint.invoiced, lastMonthPoint.invoiced),
      },
      outstanding: { total: outstandingTotal, count: unpaidInvoices.length },
      overdue: { total: overdueTotal, count: overdueCount },
    };

    const aging = ["current", "1-30", "31-60", "61-90", "90+"].map((bucket) => ({
      bucket,
      label: bucket === "current" ? "Current" : bucket === "90+" ? "90+ days" : `${bucket} days`,
      total: agingTotals[bucket],
      count: agingCounts[bucket],
    }));

    // --- Top customers: attach name/email in a second, simple lookup rather
    // than a $lookup/$unwind stage in the aggregation above - easier to
    // reason about, and this is at most 5 documents.
    const customerIds = topCustomersRaw.map((r) => r._id).filter(Boolean);
    const customers = customerIds.length
      ? await customerRepository.findAll({
          query: { _id: { $in: customerIds } },
          select: "name email",
        })
      : [];
    const customerById = new Map(customers.map((c) => [String(c._id), c]));
    const topCustomers = topCustomersRaw.map((r) => {
      const customer = customerById.get(String(r._id));
      return {
        customerId: r._id,
        name: customer?.name || "Unknown customer",
        email: customer?.email || "",
        totalCollected: r.totalCollected,
        invoiceCount: (r.invoiceIds || []).filter(Boolean).length,
      };
    });

    return {
      currency: currencyInvoice?.currency || "NGN",
      revenueTrend,
      cashFlow,
      topCustomers,
      aging,
    };
  };
}

module.exports = {
  ReportingService,
};
