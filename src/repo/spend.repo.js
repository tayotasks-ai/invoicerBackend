const BaseRepository = require('./base.repo');
const Spend = require('../models/spend.model');

class SpendRepository extends BaseRepository {
  constructor() {
    super(Spend);
  }
}

module.exports = new SpendRepository();
