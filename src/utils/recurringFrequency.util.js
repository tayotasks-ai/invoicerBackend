// Shared between the RecurringInvoice model (enum validation), its
// validations schema, and RecurringInvoiceService (advancing nextRunAt) so
// the list of supported cadences and the calendar math live in exactly one
// place.
const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"];

// Calendar-aware advancement (not a fixed millisecond offset) so "monthly"
// starting on the 31st behaves the way a person expects (rolls to the last
// day of a shorter month via JS Date's own overflow handling) rather than
// drifting by a few hours/days over time the way "add 30*24*60*60*1000ms"
// would.
function addInterval(date, frequency) {
  const next = new Date(date);
  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      throw new Error(`Unknown recurring frequency: ${frequency}`);
  }
  return next;
}

module.exports = { FREQUENCIES, addInterval };
