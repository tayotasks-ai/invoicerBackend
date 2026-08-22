require('dotenv').config();
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { errorResponse } = require('../utils/responder');

const errorConverter = (err, req, res, next) => {
  let error = err;

  // Log the original error for debugging
  console.log('Original error:', error);

  // Handle specific error types
  if (error.name === 'CastError') {
    const message = 'Resource not found';
    error = new ApiError(httpStatus.NOT_FOUND, message, true);
  } else if (error.name === 'TokenExpiredError') {
    const message = 'Token has expired. Please sign in again.';
    error = new ApiError(httpStatus.FORBIDDEN, message, true);
  } else if (error.code === 11000) { // Mongoose duplicate key
    const message = 'Duplicate field value entered';
    error = new ApiError(httpStatus.BAD_REQUEST, message, true);
  } else if (error.name === 'ValidationError') { // Mongoose validation error
    const message = Object.values(error.errors)
      .map((val) => val.message)
      .join(', ');
    error = new ApiError(httpStatus.BAD_REQUEST, message, true);
  } else if (error.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please sign in again.';
    error = new ApiError(httpStatus.FORBIDDEN, message, true);
  }

  // Convert non-ApiError instances to ApiError
  if (!(error instanceof ApiError)) {
    const statusCode =
      error.statusCode && Number.isInteger(error.statusCode)
        ? error.statusCode
        : httpStatus.INTERNAL_SERVER_ERROR;
    const message = error.message || httpStatus[statusCode] || 'Internal Server Error';
    const isOperational = statusCode !== httpStatus.INTERNAL_SERVER_ERROR;
    error = new ApiError(statusCode, message, isOperational, error.stack);
  }

  next(error);
};

const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;

  // Ensure statusCode is valid
  statusCode = Number.isInteger(statusCode) ? statusCode : httpStatus.INTERNAL_SERVER_ERROR;

  // Log the error for debugging (except in test environment)
  if (process.env.NODE_ENV !== 'test') {
    console.error('Error:', {
      statusCode,
      message,
      stack: err.stack,
      isOperational: err.isOperational
    });
  }

  // Override message for non-operational 500 errors
  if (statusCode === httpStatus.INTERNAL_SERVER_ERROR && !err.isOperational) {
    message = 'Oh sugar! We have a problem, please check back later';
  }

  // Store the error message in res.locals for potential logging middleware
  res.locals.errorMessage = err.message;

  // Include stack trace in development or test environments
  const response = {
    status: 'error',
    statusCode,
    message
  };

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    response.stack = err.stack;
  }

  return errorResponse(req, res, message, statusCode, response);
};

module.exports = {
  errorConverter,
  errorHandler,
};