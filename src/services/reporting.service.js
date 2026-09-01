const mongoose = require("mongoose");
const invoiceRepository = require("../repo/invoice.repo");
const transactionRepo = require("../repo/transaction.repo");
const customerRepository = require("../repo/customer.repo");
const recurringInvoiceRepo = require("../repo/recurringInvoice.repo");
const expenseRepository = require("../repo/expense.repo");
const { toCsv } = require("../utils/csv.util");
const { money } = require("../utils/templates/money");
const { InventoryService } = require("./inventory.service");

// How many months of history the trend chart covers, including the current
// (in-progress) month.
const TREND_MONTHS = 12;
// Invoices in these statuses still have money owed on them - "outstanding"
// and "aging" are both computed over exactly this set. Deliberately excludes
// 'draft' (never sent, so nothing is actually owed yet) and 'paid'.
const UNPAID_STATUSES = ["sent", "partially-paid", "overdue"];
// How many days before its due date an unpaid invoice shows up as
// "due soon" in the action-items feed (see getActionItems).
const ACTION_LOOKAHEAD_DAYS = 3;
// Higher severity sorts first in the action-items feed.
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

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

// Same idea as pctChange, but for a figure that can go negative (net cash
// flow = collected - expenses paid, unlike every other figure on this
// dashboard which is always >= 0). Once `previous` is zero or negative,
// pctChange's ratio stops meaning "improved/worsened" - dividing by a
// negative baseline flips the sign relative to the real change (e.g. -100 ->
// +50 is a genuine improvement, but (50 - -100) / -100 * 100 reads as -150%).
// Rather than show a number that lies about direction, this falls back to
// null ("no comparable baseline") whenever last month wasn't a clean
// positive baseline - StatCard already renders null as a neutral dash.
function netChangePct(current, previous) {
  if (previous <= 0) return null;
  return pctChange(current, previous);
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
  // Five pieces, fetched in parallel then combined in JS (kept out of the
  // aggregation pipelines themselves so the logic here is easy to follow and
  // to unit-test without a live Mongo instance):
  //   - revenueTrend: last 12 months, collected (money actually received)
  //     vs invoiced (money billed), one point per month.
  //   - cashFlowTrend: last 12 months, inflow (same "collected" figure as
  //     revenueTrend) vs outflow (expenses actually paid) vs net, one point
  //     per month - the money-in-vs-money-out view revenueTrend alone can't
  //     answer, since it never looks at expenses at all.
  //   - cashFlow: this month vs last month collected/invoiced/expenses paid
  //     (with % change), net cash flow, plus right-now snapshots of
  //     outstanding and overdue.
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
      expensesPaidByMonthRaw,
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
      // Money actually paid out to vendors (expenses in the 'paid' status),
      // grouped by the month it was paid in - the outflow half of cash flow.
      // Mirrors the collected-by-month query above; deliberately keyed off
      // `paidAt` (when the money left), not `createdAt` (when the request
      // was first sent) or `submittedAt` (when the vendor filled in their
      // details) - neither of those is when cash actually moved.
      expenseRepository.aggregate([
        {
          $match: {
            entity: entityObjectId,
            status: "paid",
            paidAt: { $gte: startOfTrendWindow },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$paidAt" } },
            total: { $sum: "$amount" },
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

    // --- Cash flow trend: same 12 fixed, zero-filled months as revenueTrend
    // - inflow reuses collectedByMonth (already computed above, no second
    // query for the same figure), outflow is the expenses-paid map just
    // fetched, net is simply their difference per month.
    const expensesPaidByMonth = new Map(expensesPaidByMonthRaw.map((r) => [r._id, r.total]));
    const cashFlowTrend = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(monthDate);
      const inflow = collectedByMonth.get(key) || 0;
      const outflow = expensesPaidByMonth.get(key) || 0;
      cashFlowTrend.push({ month: key, label: monthLabel(monthDate), inflow, outflow, net: inflow - outflow });
    }

    // --- Cash flow: this month vs last month is just two points already
    // sitting in the trend series above - no need to query again.
    const thisMonthPoint = revenueTrend[revenueTrend.length - 1];
    const lastMonthPoint = revenueTrend[revenueTrend.length - 2] || { collected: 0, invoiced: 0 };
    const thisMonthOutflow = cashFlowTrend[cashFlowTrend.length - 1].outflow;
    const lastMonthOutflow = cashFlowTrend[cashFlowTrend.length - 2]?.outflow || 0;
    const thisMonthNet = thisMonthPoint.collected - thisMonthOutflow;
    const lastMonthNet = lastMonthPoint.collected - lastMonthOutflow;

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
      expensesPaid: {
        current: thisMonthOutflow,
        previous: lastMonthOutflow,
        changePct: pctChange(thisMonthOutflow, lastMonthOutflow),
      },
      // Net cash flow = money collected minus money paid out, this month.
      // The one figure that actually answers "is the business healthy right
      // now" - collected and expensesPaid alone each only tell half of it.
      net: {
        current: thisMonthNet,
        previous: lastMonthNet,
        changePct: netChangePct(thisMonthNet, lastMonthNet),
      },
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
      cashFlowTrend,
      cashFlow,
      topCustomers,
      aging,
    };
  };

  // A Todoist-style "what needs your attention today" feed for the
  // dashboard - not a manual to-do list a business types into, but one
  // auto-derived entirely from signals this app already tracks: invoices
  // going overdue or coming due, stock running low, and recurring-invoice
  // drafts sitting unreviewed. Each item type clears itself the moment its
  // underlying condition resolves (an invoice gets paid, stock gets
  // restocked, a draft gets sent) - there's nothing to check off by hand.
  static getActionItems = async (entity_id) => {
    const now = new Date();
    const soonCutoff = new Date(now.getTime() + ACTION_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    const [unpaidInvoices, lowStockItems, recurringWithDrafts, awaitingPaymentExpenses] = await Promise.all([
      invoiceRepository.findAll({
        query: { entity: entity_id, status: { $in: UNPAID_STATUSES }, dueDate: { $ne: null } },
        select: "invoiceNumber total amountPaid currency dueDate",
        populate: [{ path: "customer", select: "name" }],
        sort: { dueDate: 1 },
      }),
      InventoryService.getLowStockItems(entity_id),
      // Every schedule that has generated at least once - filtered down to
      // "still sitting as a draft" in JS below, since a schedule whose last
      // draft has already been sent shouldn't keep showing up here forever.
      recurringInvoiceRepo.findAll({
        query: { entity: entity_id, lastGeneratedInvoice: { $ne: null } },
        populate: [
          { path: "customer", select: "name" },
          { path: "lastGeneratedInvoice", select: "invoiceNumber status total currency" },
        ],
      }),
      // Expenses (money the business owes) where the vendor has already
      // submitted amount + bank details and is waiting to be paid - the AP
      // mirror of an unpaid invoice.
      expenseRepository.findAll({ query: { entity: entity_id, status: "submitted" }, sort: { submittedAt: 1 } }),
    ]);

    const items = [];

    for (const invoice of unpaidInvoices) {
      const balance = Math.max(Number(invoice.total || 0) - Number(invoice.amountPaid || 0), 0);
      if (balance <= 0) continue;
      const due = new Date(invoice.dueDate);
      const daysPastDue = daysBetween(now, due);
      const customerName = invoice.customer?.name || "This customer";
      if (daysPastDue > 0) {
        items.push({
          id: `overdue-${invoice._id}`,
          type: "overdue_invoice",
          severity: "high",
          title: `Invoice ${invoice.invoiceNumber} is ${daysPastDue} day${daysPastDue === 1 ? "" : "s"} overdue`,
          detail: `${customerName} owes ${money(balance, invoice.currency)} - consider sending a reminder.`,
          link: { name: "invoice-detail", params: { code: invoice.invoiceNumber } },
          date: due,
        });
      } else if (due <= soonCutoff) {
        const daysUntilDue = -daysPastDue;
        items.push({
          id: `due-soon-${invoice._id}`,
          type: "due_soon_invoice",
          severity: "medium",
          title: `Invoice ${invoice.invoiceNumber} is due ${daysUntilDue === 0 ? "today" : `in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`}`,
          detail: `${customerName} owes ${money(balance, invoice.currency)}.`,
          link: { name: "invoice-detail", params: { code: invoice.invoiceNumber } },
          date: due,
        });
      }
    }

    for (const item of lowStockItems) {
      items.push({
        id: `low-stock-${item._id}`,
        type: "low_stock",
        severity: "medium",
        title: `${item.name} is running low on stock`,
        detail: `${item.quantityInStock} ${item.unit || "unit"}${item.quantityInStock === 1 ? "" : "s"} left (threshold: ${item.lowStockThreshold}).`,
        link: { name: "inventory" },
        date: now,
      });
    }

    for (const schedule of recurringWithDrafts) {
      // Once the business sends the generated draft, its status moves off
      // 'draft' - this item disappears from the feed on its own, no
      // dismiss/complete action needed.
      if (schedule.lastGeneratedInvoice?.status !== "draft") continue;
      items.push({
        id: `recurring-draft-${schedule._id}`,
        type: "recurring_draft",
        severity: "medium",
        title: `A recurring draft for ${schedule.customer?.name || "a customer"} is ready to review`,
        detail: `Invoice ${schedule.lastGeneratedInvoice.invoiceNumber} (${money(schedule.lastGeneratedInvoice.total, schedule.lastGeneratedInvoice.currency)}) was generated automatically and is waiting to be sent.`,
        link: { name: "invoice-detail", params: { code: schedule.lastGeneratedInvoice.invoiceNumber } },
        date: schedule.lastGeneratedAt || now,
      });
    }

    for (const expense of awaitingPaymentExpenses) {
      items.push({
        id: `expense-${expense._id}`,
        type: "expense_awaiting_payment",
        severity: "medium",
        title: `${expense.payeeName || expense.vendorName || "A vendor"} is waiting to be paid`,
        detail: `${money(expense.amount, expense.currency)}${expense.description ? ` for ${expense.description}` : ""} - bank details are on file, ready to pay.`,
        link: { name: "expense-detail", params: { code: expense.code } },
        date: expense.submittedAt || now,
      });
    }

    items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || new Date(a.date) - new Date(b.date));

    // Capped so a business with a large backlog gets a focused list rather
    // than a wall of items - totalCount lets the frontend say "+12 more".
    return { items: items.slice(0, 15), totalCount: items.length };
  };

  // Every matching transaction as a CSV string - the closest thing to a
  // bank statement this app can hand a business (or their accountant).
  // Capped at 5000 rows, same reasoning as InvoiceService.exportInvoicesCsv.
  static exportTransactionsCsv = async (entity_id, filters = {}) => {
    const { status, startDate, endDate } = filters;
    const match = { entity: new mongoose.Types.ObjectId(entity_id) };
    if (status) match.status = { $in: status.split(",") };
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    const transactions = await transactionRepo.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: 5000 },
      { $lookup: { from: "customers", localField: "customer", foreignField: "_id", as: "customer" } },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
      // `invoice` is optional on a Transaction (see transaction.model.js -
      // a subscription payment has no invoice), so this lookup must
      // preserve rows with no match too, not just drop them.
      { $lookup: { from: "invoices", localField: "invoice", foreignField: "_id", as: "invoice" } },
      { $unwind: { path: "$invoice", preserveNullAndEmptyArrays: true } },
    ]);

    return toCsv(transactions, [
      { header: "Date", value: (t) => (t.createdAt ? new Date(t.createdAt).toISOString() : "") },
      { header: "Amount", key: "amount" },
      { header: "Currency", key: "currency" },
      { header: "Channel", key: "channel" },
      { header: "Method", value: (t) => t.method || "" },
      { header: "Status", key: "status" },
      { header: "Customer", value: (t) => t.customer?.name || "" },
      { header: "Invoice", value: (t) => t.invoice?.invoiceNumber || "" },
      { header: "Reference", key: "reference" },
    ]);
  };
}

module.exports = {
  ReportingService,
};
