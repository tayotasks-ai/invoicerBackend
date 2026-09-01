const recurringInvoiceRepo = require("../repo/recurringInvoice.repo");
const customerRepository = require("../repo/customer.repo");
const entityRepository = require("../repo/entity.repo");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const { getPlan, effectivePlanId } = require("../config/plans");
const { FREQUENCIES, addInterval } = require("../utils/recurringFrequency.util");
const { InvoiceService } = require("./invoice.service");

const POPULATE = [
  { path: "customer", select: "name email phone" },
  { path: "lastGeneratedInvoice", select: "invoiceNumber status total currency" },
];

class RecurringInvoiceService {
  static createSchedule = async (data, entity_id) => {
    const owningEntity = await entityRepository.findById(entity_id);
    abortIf(!owningEntity, httpStatus.BAD_REQUEST, "Invalid Entity Id");

    // Recurring invoices are a Growth-plan+ feature, same tier as reminders
    // and quotes (see config/plans.js) - enforced here at the service entry
    // point, matching how every other plan-gated feature in this app does it.
    abortIf(
      !getPlan(effectivePlanId(owningEntity)).allowRecurringInvoices,
      httpStatus.FORBIDDEN,
      "Recurring invoices are available on the Growth plan and above. Upgrade your plan to set one up."
    );

    let customer;
    abortIf(!data.customer && !data.customerId, httpStatus.BAD_REQUEST, "Customer is required");
    if (data.customerId) {
      customer = await customerRepository.findOne({ query: { _id: data.customerId, entity: entity_id } });
      abortIf(!customer, httpStatus.NOT_FOUND, "Customer not found");
    } else {
      customer = await customerRepository.create({ ...data.customer, entity: entity_id });
      abortIf(!customer, httpStatus.BAD_REQUEST, "Error creating customer");
    }

    const startDate = new Date(data.startDate);
    const schedule = await recurringInvoiceRepo.create({
      entity: entity_id,
      customer: customer._id,
      items: data.items,
      currency: data.currency,
      tax: data.tax || 0,
      notes: data.notes,
      terms: data.terms,
      frequency: data.frequency,
      dueInDays: data.dueInDays ?? 14,
      startDate,
      endDate: data.endDate ? new Date(data.endDate) : null,
      // First cycle is due exactly on startDate - the batch job (or an
      // explicit "Generate now") is what actually produces it.
      nextRunAt: startDate,
    });
    return recurringInvoiceRepo.findOne({ query: { _id: schedule._id }, populate: POPULATE });
  };

  static getAllSchedules = async (entity_id) => {
    return recurringInvoiceRepo.findAll({
      query: { entity: entity_id },
      sort: { createdAt: -1 },
      populate: POPULATE,
    });
  };

  static _findOwned = async (code, entity_id) => {
    const schedule = await recurringInvoiceRepo.findOne({
      query: { code, entity: entity_id },
      populate: POPULATE,
    });
    abortIf(!schedule, httpStatus.NOT_FOUND, "Recurring invoice schedule not found");
    return schedule;
  };

  static getSchedule = async (code, entity_id) => RecurringInvoiceService._findOwned(code, entity_id);

  static updateSchedule = async (code, entity_id, data) => {
    const schedule = await RecurringInvoiceService._findOwned(code, entity_id);
    const patch = {};
    ["items", "currency", "tax", "notes", "terms", "dueInDays"].forEach((key) => {
      if (data[key] !== undefined) patch[key] = data[key];
    });
    if (data.endDate !== undefined) patch.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.frequency && FREQUENCIES.includes(data.frequency)) {
      patch.frequency = data.frequency;
      // Changing frequency mid-cycle re-anchors the next run from today
      // rather than keeping whatever nextRunAt the old frequency had
      // computed - e.g. switching monthly -> weekly shouldn't leave the
      // schedule waiting out the rest of a month before the first weekly
      // draft appears.
      if (data.frequency !== schedule.frequency) {
        patch.nextRunAt = new Date();
      }
    }
    const updated = await recurringInvoiceRepo.update(schedule._id, patch);
    return recurringInvoiceRepo.findOne({ query: { _id: updated._id }, populate: POPULATE });
  };

  static setActive = async (code, entity_id, isActive) => {
    const schedule = await RecurringInvoiceService._findOwned(code, entity_id);
    const updated = await recurringInvoiceRepo.update(schedule._id, { isActive });
    return recurringInvoiceRepo.findOne({ query: { _id: updated._id }, populate: POPULATE });
  };

  static deleteSchedule = async (code, entity_id) => {
    const schedule = await RecurringInvoiceService._findOwned(code, entity_id);
    await recurringInvoiceRepo.delete(schedule._id);
    return schedule;
  };

  // Builds one draft invoice from a schedule and advances nextRunAt by one
  // interval - shared by the scheduled batch job and the manual "Generate
  // now" button, the same relationship as
  // ReminderService.sendReminderForInvoice/runChaser. Always advances from
  // the schedule's own nextRunAt (not "now") so the cadence stays anchored
  // to the original schedule even if a manual generation happens early, or
  // the batch job runs late and is catching up.
  static _generateOne = async (schedule) => {
    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + (schedule.dueInDays || 0) * 24 * 60 * 60 * 1000);

    const invoice = await InvoiceService.createInvoice(
      {
        customerId: schedule.customer._id || schedule.customer,
        currency: schedule.currency,
        tax: schedule.tax || 0,
        notes: schedule.notes,
        terms: schedule.terms,
        issueDate,
        dueDate,
        items: schedule.items.map((item) => ({
          inventoryItemId: item.inventoryItemId || undefined,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      },
      schedule.entity._id || schedule.entity,
      { skipEmail: true }
    );

    const nextRunAt = addInterval(schedule.nextRunAt, schedule.frequency);
    // A schedule with an end date stops re-arming itself once the *next*
    // cycle would fall past it - this cycle's draft (just generated above)
    // still goes out even if it's the last one.
    const isActive = schedule.endDate ? nextRunAt <= schedule.endDate : schedule.isActive;

    await recurringInvoiceRepo.update(schedule._id, {
      lastGeneratedAt: issueDate,
      lastGeneratedInvoice: invoice._id,
      generationCount: (schedule.generationCount || 0) + 1,
      nextRunAt,
      isActive,
    });

    return invoice;
  };

  // Manual trigger - lets a business generate this cycle's draft immediately
  // instead of waiting for the scheduled job, e.g. to see exactly what a
  // new schedule will produce. Fires even if nextRunAt is still in the
  // future; the interval still advances from nextRunAt itself afterwards
  // (not from today), so the schedule's cadence is unaffected by an early
  // manual run.
  static generateNow = async (code, entity_id) => {
    const schedule = await RecurringInvoiceService._findOwned(code, entity_id);
    abortIf(
      !schedule.isActive,
      httpStatus.BAD_REQUEST,
      "This schedule is paused - resume it before generating a draft."
    );
    await RecurringInvoiceService._generateOne(schedule);
    return RecurringInvoiceService._findOwned(code, entity_id);
  };

  // Batch entry point for the scheduled job - see
  // src/jobs/generateRecurringInvoices.js, which any external scheduler
  // (cron, a host's "scheduled jobs" feature, a GitHub Actions cron
  // workflow) can invoke daily via `npm run generate-recurring-invoices`,
  // the same pattern as sendPaymentReminders.js/send-reminders.
  static generateDueInvoices = async () => {
    const now = new Date();
    const due = await recurringInvoiceRepo.findAll({
      query: { isActive: true, nextRunAt: { $lte: now } },
      populate: [{ path: "customer" }, { path: "entity", select: "plan" }],
    });

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    for (const schedule of due) {
      // Plan may have been downgraded since this schedule was created -
      // don't generate, but don't leave it stuck re-querying forever either;
      // push nextRunAt forward so it's revisited next cycle instead of
      // showing up in this job's "due" list every single day.
      if (!getPlan(effectivePlanId(schedule.entity)).allowRecurringInvoices) {
        await recurringInvoiceRepo.update(schedule._id, {
          nextRunAt: addInterval(schedule.nextRunAt, schedule.frequency),
        });
        skipped++;
        continue;
      }
      try {
        await RecurringInvoiceService._generateOne(schedule);
        generated++;
      } catch (error) {
        // One schedule failing (e.g. an inventory item now out of stock)
        // shouldn't block every other business's recurring invoices from
        // generating - log and move on. nextRunAt is untouched on failure,
        // so this schedule stays "due" and is retried on the job's next run
        // rather than silently skipping the missed cycle forever.
        console.error(
          `Failed to generate recurring invoice for schedule ${schedule.code}:`,
          error.message
        );
        failed++;
      }
    }
    return { generated, skipped, failed, total: due.length };
  };
}

module.exports = { RecurringInvoiceService };
