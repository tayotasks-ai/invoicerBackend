const BaseRepository = require('./base.repo');
const BankAccount = require('../models/bankAccount.model');

class BankAccountRepository extends BaseRepository {
  constructor() {
    super(BankAccount);
  }
}

module.exports = new BankAccountRepository();