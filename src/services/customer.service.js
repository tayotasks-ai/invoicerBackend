const customerRepository = require("../repo/customer.repo");

class CustomerService {
  // Used by the "pick an existing customer" step of invoice creation, and by
  // a standalone customers list in the dashboard.
  static getAllCustomers = async (entity_id) => {
    return customerRepository.findAll({
      query: { entity: entity_id },
      sort: { name: 1 },
    });
  };
}

module.exports = {
  CustomerService,
};
