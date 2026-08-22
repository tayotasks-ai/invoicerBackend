const BaseRepository = require('./base.repo');
const Entity = require('../models/entity.model');

class EntityRepository extends BaseRepository {
  constructor() {
    super(Entity);
  }
}

module.exports = new EntityRepository();