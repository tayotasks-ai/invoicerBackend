const BaseRepository = require('./base.repo');
const Expense = require('../models/expense.model');

class ExpenseRepository extends BaseRepository {
  constructor() {
    super(Expense);
  }
}

module.exports = new ExpenseRepository();
