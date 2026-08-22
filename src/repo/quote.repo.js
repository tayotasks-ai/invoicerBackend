const BaseRepository = require('./base.repo');
const Quote = require('../models/quote.model');

class QuoteRepository extends BaseRepository {
  constructor() {
    super(Quote);
  }
}

module.exports = new QuoteRepository();
