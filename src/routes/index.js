const authRoute = require('./auth.route');
const invoiceRoute = require('./invoice.route');
const utilsRoute = require('./utils.route');
const entityRoute = require('./entity.route');
const webHookRoute = require('./webhook.route');
const customerRoute = require('./customer.route');
const inventoryRoute = require('./inventory.route');
const quoteRoute = require('./quote.route');
const accountantRoute = require('./accountant.route');
const reportingRoute = require('./reporting.route');

module.exports = {
  authRoute,
  invoiceRoute,
  utilsRoute,
  entityRoute,
  webHookRoute,
  customerRoute,
  inventoryRoute,
  quoteRoute,
  accountantRoute,
  reportingRoute
};
