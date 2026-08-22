const Joi = require('joi');
const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');

function validateReq(schema) {
  return function (req, res, next) {
    const validSchema = pick(schema, ['params', 'query', 'body']);
    const object = pick(req, Object.keys(validSchema));
    const result = check(validSchema, object);
    const value = result.value;
    const error = result.error;

    if (error) {
      var errorMessage = error.details.map(function (details) {
        return details.message;
      }).join(', ');
      return next(new ApiError(httpStatus.BAD_REQUEST, errorMessage));
    }

    Object.assign(req, value);
    return next();
  };
}

function check(schema, data) {
  const object = pick(data, Object.keys(schema));
  return Joi.compile(schema)
    .prefs({ errors: { label: 'key' } })
    .validate(object);
}

function validate(schema, data) {
  const result = check(schema, data);
  const value = result.value;
  const error = result.error;

  if (error) {
    var errorMessage = error.details.map(function (details) {
      return details.message;
    }).join(', ');
    throw new ApiError(httpStatus.BAD_REQUEST, errorMessage);
  }

  return value;
}

module.exports = {
  validateReq: validateReq,
  validate: validate
};
