require('dotenv').config();
const express = require('express');
const app = express();

const ApiError = require('./src/utils/ApiError');
const httpStatus = require('http-status');
const cors = require('cors');
const { authRoute, invoiceRoute, utilsRoute, entityRoute, webHookRoute, customerRoute, inventoryRoute, quoteRoute, accountantRoute, reportingRoute } = require('./src/routes');
const { errorConverter, errorHandler } = require('./src/middleware/error');
const fileUpload = require("express-fileupload");
const dbConnect = require('./src/config/db.config');

const corsOptions = {
  origin: '*', // Update this for production
  credentials: true,
  optionSuccessStatus: 200,
};

// Logo/signature uploads (see entity.route.js) are now stored as base64
// data: URIs directly on the entity document (no Cloudinary/S3), so a
// hard size cap matters more than it used to - an uncapped upload here
// would bloat the `entity` document, which gets fetched on essentially
// every authenticated request. 2MB is generous for a logo/signature.
app.use(fileUpload({
  useTempFiles : true,
  tempFileDir : '/tmp/',
  limits: { fileSize: 2 * 1024 * 1024 },
  abortOnLimit: true,
  responseOnLimit: 'File too large - the maximum size is 2MB.',
}));

// Middleware
app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: true }));
// `verify` stashes the raw request body so the Paystack webhook handler can
// check the x-paystack-signature HMAC against the exact bytes that were sent.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

app.get('/', (req, res) => {
  res.send('Server is up and running!');
});

// Routes
app.use('/api/v1', authRoute);
app.use('/api/v1', invoiceRoute);
app.use('/api/v1', utilsRoute);
app.use('/api/v1', entityRoute);
app.use('/api/v1', webHookRoute);
app.use('/api/v1', customerRoute);
app.use('/api/v1', inventoryRoute);
app.use('/api/v1', quoteRoute);
app.use('/api/v1', accountantRoute);
app.use('/api/v1', reportingRoute);

// Catch-all for 404 errors
app.use((req, res, next) => {
  console.log(`Endpoint not found: ${req.method} ${req.originalUrl}`);
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found', true));
});

// Error handling middleware
app.use(errorConverter);
app.use(errorHandler);

// Database connection is established as a side effect of requiring
// ./src/config/db.config above. Starting the HTTP server is start.js's job —
// app.js only builds and exports the Express app so it can be required by
// both start.js and the test suite without binding a port twice.
module.exports = app;