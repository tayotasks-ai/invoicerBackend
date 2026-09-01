const catchAsync = require('../utils/catchAsync');
const { EntityService } = require('../services');
const { successResponse } = require('../utils/responder');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

class EntityController {
  static addBank = catchAsync(async (req, res, next) => {
    const { accountNumber, bankCode, isActive } = req.body;
    const user = req.user;
    const addBankService = await EntityService.addBank({ accountNumber, bankCode, userId: user.id, isActive })
    return successResponse(req, res, addBankService, 'Operation Successful');
  });

  static getBanks = catchAsync(async (req, res, next) => {
    const user = req.user;
    const banks = await EntityService.getBanks({ userId: user.id })
    return successResponse(req, res, banks, 'Operation Successful');
  });

  static addLogo = catchAsync(async (req, res, next) => {
    const user = req.user;
    const file = req.files?.file;
    if (!file) {
      return next(new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded', true));
    }
    const result = await EntityService.addLogo({ userId: user.id, file });
    return successResponse(req, res, result, 'Logo uploaded successfully');
  });

  static addSignature = catchAsync(async (req, res, next) => {
    const user = req.user;
    const file = req.files?.file;
    if (!file) {
      return next(new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded', true));
    }
    const result = await EntityService.addSignature({ userId: user.id, file });
    return successResponse(req, res, result, 'Signature uploaded successfully');
  });

  static editEntity = catchAsync(async (req, res, next) => {
    const entity = req.user;
    const data = req.body;
    const editEntity = await EntityService.editEntity({ data, entity });
    return successResponse(req, res, editEntity, 'Operation Successful');
  })

  static addMember = catchAsync(async (req, res, next) => {
    const entity = req.user;
    const data = req.body;
    const addMember = await EntityService.addMember({ data, entity });
    return successResponse(req, res, addMember, 'Operation Successful');
  })

  // Lets the frontend refresh its cached entity (plan, invoiceTemplate,
  // monthly invoice usage) without forcing a re-login after a mutation.
  static getMe = catchAsync(async (req, res, next) => {
    const user = req.user;
    const entity = await EntityService.getMe(user.id);
    return successResponse(req, res, entity, 'Operation Successful');
  });

  static listTemplates = catchAsync(async (req, res, next) => {
    const user = req.user;
    const templates = await EntityService.listTemplates(user.id);
    return successResponse(req, res, templates, 'Operation Successful');
  });

  // Streams the rendered preview PDF straight back - binary response, not a
  // JSON envelope, same as InvoiceController.downloadInvoiceById.
  static previewTemplate = catchAsync(async (req, res, next) => {
    const user = req.user;
    const { templateId } = req.params;
    const pdfBuffer = await EntityService.previewTemplate(user.id, templateId);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename=preview_${templateId}.pdf`);
    return res.send(pdfBuffer);
  });

  static getPlans = catchAsync(async (req, res, next) => {
    const plans = EntityService.getPlans();
    return successResponse(req, res, plans, 'Operation Successful');
  });

  static subscribe = catchAsync(async (req, res, next) => {
    const user = req.user;
    const { plan } = req.body;
    const result = await EntityService.subscribe({ userId: user.id, planId: plan });
    return successResponse(req, res, result, 'Operation Successful');
  });

  static provisionVirtualAccount = catchAsync(async (req, res, next) => {
    const user = req.user;
    const { bankVerificationNumber } = req.body;
    const result = await EntityService.provisionVirtualAccount({ userId: user.id, bankVerificationNumber });
    return successResponse(req, res, result, 'Virtual account activated');
  });
}

module.exports = {
  EntityController,
};
