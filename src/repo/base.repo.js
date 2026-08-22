class BaseRepository {
  constructor(model) {
    if (!model) throw new Error("Model is required");
    this.model = model;
  }

  async create(data) {
    try {
      const document = new this.model(data);
      return await document.save();
    } catch (error) {
      throw new Error(`Create Error: ${error.message}`);
    }
  }

  async findAll({
    query = {},
    select = null,
    sort = null,
    populate = null,
  } = {}) {
    try {
      let queryBuilder = this.model.find(query);

      if (select) queryBuilder = queryBuilder.select(select);
      if (sort) queryBuilder = queryBuilder.sort(sort);
      if (populate) queryBuilder = queryBuilder.populate(populate);

      return await queryBuilder.exec();
    } catch (error) {
      throw new Error(`FindAll Error: ${error.message}`);
    }
  }

  async paginate({
    query = {},
    page = 1,
    limit = 10,
    select = null,
    sort = null,
    populate = null,
  } = {}) {
    try {
      const skip = (page - 1) * limit;
      let queryBuilder = this.model.find(query);

      if (select) queryBuilder = queryBuilder.select(select);
      if (sort) queryBuilder = queryBuilder.sort(sort);
      if (populate) queryBuilder = queryBuilder.populate(populate);

      queryBuilder = queryBuilder.skip(skip).limit(limit);

      const [documents, total] = await Promise.all([
        queryBuilder.exec(),
        this.model.countDocuments(query),
      ]);

      return {
        data: documents,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit),
          hasNextPage: Number(page) < Math.ceil(total / limit),
          hasPrevPage: Number(page) > 1,
        },
      };
    } catch (error) {
      throw new Error(`Paginate Error: ${error.message}`);
    }
  }

  async countDocuments(query = {}) {
    try {
      return await this.model.countDocuments(query).exec();
    } catch (error) {
      throw new Error(`CountDocuments Error: ${error.message}`);
    }
  }

  async aggregate(pipeline) {
    try {
      return await this.model.aggregate(pipeline).exec();
    } catch (error) {
      throw new Error(`Aggregate Error: ${error.message}`);
    }
  }

  async findOne({
    query = {},
    select = null,
    sort = null,
    populate = null,
  } = {}) {
    try {
      let queryBuilder = this.model.findOne(query);

      if (select) queryBuilder = queryBuilder.select(select);
      if (sort) queryBuilder = queryBuilder.sort(sort);
      if (populate) queryBuilder = queryBuilder.populate(populate);

      return await queryBuilder.exec();
    } catch (error) {
      throw new Error(`FindOne Error: ${error.message}`);
    }
  }

  async findById(id, select = null) {
    try {
      let query = this.model.findById(id);
      if (select) query = query.select(select);
      return await query.exec();
    } catch (error) {
      throw new Error(`FindById Error: ${error.message}`);
    }
  }

  async update(id, updateData) {
    try {
      return await this.model.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });
    } catch (error) {
      throw new Error(`Update Error: ${error.message}`);
    }
  }

  async delete(id) {
    try {
      return await this.model.findByIdAndDelete(id);
    } catch (error) {
      throw new Error(`Delete Error: ${error.message}`);
    }
  }

  async insertMany(dataArray, options = {}) {
    try {
      if (!Array.isArray(dataArray)) {
        throw new Error("Data must be an array");
      }
      return await this.model.insertMany(dataArray, options);
    } catch (error) {
      throw new Error(`InsertMany Error: ${error.message}`);
    }
  }

  async seed(dataArray) {
    try {
      await this.model.deleteMany({});
      return await this.model.insertMany(dataArray);
    } catch (error) {
      throw new Error(`Seed Error: ${error.message}`);
    }
  }
}

module.exports = BaseRepository;
