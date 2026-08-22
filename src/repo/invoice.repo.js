const BaseRepository = require('./base.repo');
const Invoice = require('../models/invoice.model');

class InvoiceRepository extends BaseRepository {
  constructor() {
    super(Invoice);
  }
}

module.exports = new InvoiceRepository();