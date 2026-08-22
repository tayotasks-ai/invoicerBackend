const BaseRepository = require('./base.repo');
const AccountantAccess = require('../models/accountantAccess.model');

class AccountantAccessRepository extends BaseRepository {
  constructor() {
    super(AccountantAccess);
  }
}

module.exports = new AccountantAccessRepository();
