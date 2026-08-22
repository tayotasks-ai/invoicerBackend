const httpStatus = require("http-status").default;
const ApiError = require("./ApiError");
const stream = require("stream");

const ApiResponder = (req, res, statusCode, message, payload, extra = {}) => {
  const data = {
    status: statusCode,
    success:
      statusCode === httpStatus.OK || statusCode === httpStatus.CREATED
        ? "true"
        : "false",
    message,
    data: payload,
    ...extra,
  };
  res.status(statusCode).send(data);
};

const redirectResponder = (res, redirect_url) => {
  res.redirect(redirect_url);
};

const downloadResponder = (res, filepath, filename) => {
  res.download(filepath, filename);
};

const redirect = (res, redirect_url) => {
  return redirectResponder(res, redirect_url);
};

const download = (res, filepath, filename) => {
  console.log("About to download");
  return downloadResponder(res, filepath, filename);
};

const downloadPdfFile = async (fileData, res, fileName) => {
  var fileContents = Buffer.from(fileData, "base64");

  var readStream = new stream.PassThrough();
  readStream.end(fileContents);

  res.set("Content-disposition", "attachment; filename=" + fileName);
  res.set("Content-Type", "application/pdf");

  readStream.pipe(res);
};

const downloadFile = async (fileData, res, fileName, content_type) => {
  var fileContents = Buffer.from(fileData, "base64");

  var readStream = new stream.PassThrough();
  readStream.end(fileContents);

  res.set("Content-disposition", "attachment; filename=" + fileName);
  res.setHeader("Content-Type", content_type);

  return await readStream.pipe(res);
};

const zipDownload = async () => {};

const successResponse = (req, res, payload = {}, message = "Success") => {
  return ApiResponder(req, res, httpStatus.OK, message, payload);
};

const errorResponse = (
  req,
  res,
  message = null,
  statusCode = httpStatus.INTERNAL_SERVER_ERROR,
  extra = {}
) => {
  const httpMessage = message || httpStatus[statusCode];
  return ApiResponder(req, res, statusCode, httpMessage, {}, extra);
};

const abort = (statusCode, message) => {
  if (!httpStatus[statusCode] && !Number.isInteger(statusCode)) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Invalid status code provided"
    );
  }
  const errorMessage = message || httpStatus[statusCode] || "An error occurred";
  throw new ApiError(statusCode, errorMessage);
};

const abortIf = (condition, statusCode, message) => {
  if (condition) {
    abort(statusCode, message);
  }
};

const abortUnless = (condition, statusCode, message) => {
  if (!condition) {
    abort(statusCode, message);
  }
};

module.exports = {
  ApiResponder,
  successResponse,
  errorResponse,
  abort,
  abortIf,
  abortUnless,
  redirect,
  download,
  downloadFile,
  downloadPdfFile,
};
