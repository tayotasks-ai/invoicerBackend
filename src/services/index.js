const { AuthService } = require('./auth.service');
const { InvoiceService } = require('./invoice.service');
const { UtilsService } = require('./utils.service');
const { EntityService } = require('./entity.service');
const { CustomerService } = require('./customer.service');
const { ReminderService } = require('./reminder.service');
const { FirsService } = require('./firs.service');
const { InventoryService } = require('./inventory.service');
const { QuoteService } = require('./quote.service');
const { AccountantService } = require('./accountant.service');

module.exports = {
  AuthService,
  InvoiceService,
  UtilsService,
  EntityService,
  CustomerService,
  ReminderService,
  FirsService,
  InventoryService,
  QuoteService,
  AccountantService
};
