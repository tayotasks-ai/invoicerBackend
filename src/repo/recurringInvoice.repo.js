const BaseRepository = require('./base.repo');
const RecurringInvoice = require('../models/recurringInvoice.model');

class RecurringInvoiceRepository extends BaseRepository {
  constructor() {
    super(RecurringInvoice);
  }
}

module.exports = new RecurringInvoiceRepository();
