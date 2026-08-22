const BaseRepository = require('./base.repo');
const Customer = require('../models/customer.model');

class CustomerRepository extends BaseRepository {
  constructor() {
    super(Customer);
  }
}

module.exports = new CustomerRepository();