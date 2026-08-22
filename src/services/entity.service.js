const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Entity = require("../models/entity.model");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const bankRepository = require("../repo/bankAccount.repo");
const entityRepository = require("../repo/entity.repo");
const invoiceRepository = require("../repo/invoice.repo");
const { PaystackPaymentGateway } = require("../utils/paystack.utils");
const cloudinaryUtil = require("../utils/cloudinary.util");
const jwt = require("jsonwebtoken");
const Authorization = require("../utils/authorization.service");
const { getTheme, listThemes, DEFAULT_THEME_ID } = require("../utils/templates/themes");
const { buildSampleInvoiceData } = require("../utils/sampleInvoiceData");
const { generateInvoice } = require("../utils/invoice");
const { getPlan, listPlans } = require("../config/plans");

class EntityService {
  static addBank = async ({
    accountNumber,
    bankCode,
    userId,
    isActive = false,
  }) => {
    const existingEntity = await entityRepository.findOne({
      query: { _id: userId },
    });
    abortIf(!existingEntity, httpStatus.BAD_REQUEST, "Entity does not exist");
    const paystack = new PaystackPaymentGateway();
    const subAccount = await paystack.createSubaccount({
      account_number: accountNumber,
      bank_code: bankCode,
      business_name: existingEntity.name,
      percentage_charge: 0.3,
      description: "",
      primary_contact_email: existingEntity.email,
    });
    //create bank repo
    const createBank = await bankRepository.create({
      accountNumber,
      accountName: subAccount.data.account_name,
      bankName: subAccount.data.settlement_bank,
      subAccountCode: subAccount.data.subaccount_code,
      entity: userId,
      isActive,
    });
    return createBank;
  };

  static getBanks = async ({ userId }) => {
    const existingEntity = await entityRepository.findOne({
      query: { _id: userId },
    });
    abortIf(!existingEntity, httpStatus.BAD_REQUEST, "Entity does not exist");
    const allBanks = await bankRepository.findAll({
      query: { entity: userId },
    });
    return allBanks;
  };

  // Uploads a business logo image to Cloudinary and stores its URL on the
  // entity so it can be printed on generated invoice PDFs.
  static addLogo = async ({ userId, file }) => {
    const entity = await entityRepository.findById(userId);
    abortIf(!entity, httpStatus.NOT_FOUND, "Entity not found");
    const uploaded = await cloudinaryUtil.uploadImage(file.tempFilePath, "logos");
    const updated = await entityRepository.update(userId, { logo: uploaded.secure_url });
    return { logo: updated.logo };
  };

  // Same as addLogo, for the signature image used to sign invoices.
  static addSignature = async ({ userId, file }) => {
    const entity = await entityRepository.findById(userId);
    abortIf(!entity, httpStatus.NOT_FOUND, "Entity not found");
    const uploaded = await cloudinaryUtil.uploadImage(file.tempFilePath, "signatures");
    const updated = await entityRepository.update(userId, { signature: uploaded.secure_url });
    return { signature: updated.signature };
  };

  static editEntity = async (data) => {
    const entity = await entityRepository.findById(data.entity.id);
    abortIf(!entity, httpStatus.BAD_REQUEST, "Invalid Entity Id");

    // The 6 logo-enabled themes are a paid feature - block selecting one
    // unless the business's plan allows it (see src/config/plans.js).
    if (data.data.invoiceTemplate) {
      const theme = getTheme(data.data.invoiceTemplate);
      const plan = getPlan(entity.plan);
      abortIf(
        theme.tier === "premium" && !plan.allowPremiumTemplates,
        httpStatus.FORBIDDEN,
        "This template requires a paid subscription. Upgrade your plan to use it."
      );
    }

    const updatedEntity = await entityRepository.update(
      data.entity.id,
      data.data
    );
    abortIf(!updatedEntity, httpStatus.BAD_REQUEST, "Unable to update entity");
    return {};
  };

  // Template gallery for the frontend picker: every theme, flagged with
  // whether it's locked (premium + no qualifying plan) and which one is
  // currently selected.
  static listTemplates = async (userId) => {
    const entity = await entityRepository.findById(userId);
    abortIf(!entity, httpStatus.BAD_REQUEST, "Invalid Entity Id");
    const plan = getPlan(entity.plan);
    const selected = entity.invoiceTemplate || DEFAULT_THEME_ID;
    return listThemes().map((theme) => ({
      ...theme,
      locked: theme.tier === "premium" && !plan.allowPremiumTemplates,
      selected: theme.id === selected,
    }));
  };

  // Renders a sample invoice (dummy data + the business's real name/logo) on
  // a given template, so a business can see exactly what it'll look like
  // before selecting it - without needing a real invoice to exist yet.
  static previewTemplate = async (userId, templateId) => {
    const entity = await entityRepository.findById(userId);
    abortIf(!entity, httpStatus.BAD_REQUEST, "Invalid Entity Id");
    const theme = getTheme(templateId);
    const plan = getPlan(entity.plan);
    abortIf(
      theme.tier === "premium" && !plan.allowPremiumTemplates,
      httpStatus.FORBIDDEN,
      "This template requires a paid subscription. Upgrade your plan to preview it."
    );
    const sampleData = buildSampleInvoiceData(entity, theme.id);
    return generateInvoice(sampleData);
  };

  // The frontend caches the entity at sign-in/sign-up and has no other way
  // to learn about server-side changes to it (template selection, plan
  // upgrades from the subscription webhook, this month's invoice count for
  // the free-tier usage indicator) without this endpoint - it's what
  // authStore.refreshEntity() polls after any mutation that touches those.
  static getMe = async (userId) => {
    const entity = await entityRepository.findById(userId);
    abortIf(!entity, httpStatus.NOT_FOUND, "Entity not found");
    const plan = getPlan(entity.plan);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const invoicesThisMonth = await invoiceRepository.countDocuments({
      entity: userId,
      createdAt: { $gte: startOfMonth },
    });

    return {
      ...entity.toJSON(),
      planDetails: { ...plan, invoicesThisMonth },
    };
  };

  static getPlans = () => listPlans();

  // Upgrades a business's plan. Real recurring billing would use Paystack's
  // Subscription Plans API, which requires a plan to be created from the
  // Paystack dashboard first (not available in this environment) - so this
  // charges a single one-time transaction tagged with
  // `metadata.purpose = 'subscription'`, and the webhook handler
  // (utils.service.js) upgrades `entity.plan` once it clears. See
  // src/config/plans.js for the full rationale.
  static subscribe = async ({ userId, planId }) => {
    const entity = await entityRepository.findById(userId);
    abortIf(!entity, httpStatus.BAD_REQUEST, "Invalid Entity Id");
    const plan = getPlan(planId);
    abortIf(
      !plan || planId === "free",
      httpStatus.BAD_REQUEST,
      "Invalid plan selected"
    );
    const reference = crypto.randomUUID().split("-").join("").slice(0, 17);
    const paystackGateway = new PaystackPaymentGateway();
    const paymentResponse = await paystackGateway.initiatePayment({
      email: entity.email,
      amount: plan.priceNGN,
      currency: "NGN",
      reference,
      metadata: {
        purpose: "subscription",
        entityId: String(entity._id),
        plan: plan.id,
        custom_fields: [
          { display_name: "Plan", variable_name: "plan", value: plan.name },
        ],
      },
    });
    abortIf(
      !paymentResponse.success,
      httpStatus.BAD_REQUEST,
      paymentResponse.message
    );
    return paymentResponse;
  };

  static addMember = async (data) => {
    const entity = await entityRepository.findById(data.entity.id);
    abortIf(!entity, httpStatus.BAD_REQUEST, "Invalid Entity Id");
    const { first_name, last_name, email, type } = data.data;
    const { id } = data.entity;
    // TODO(roadmap): email this temp password to the invitee instead of
    // returning it in the API response - there's no email delivery wired up
    // yet, so this is a stopgap that at least makes the invite usable.
    const tempPassword = crypto.randomBytes(6).toString("hex");
    const password = await bcrypt.hash(tempPassword, 10);
    const createdEntity = await entityRepository.create({
      first_name,
      last_name,
      email,
      type: "staff",
      parent_id: id,
      name: entity.name,
      password,
    });
    return { entity: createdEntity, tempPassword };
  };
}

module.exports = {
  EntityService,
};
