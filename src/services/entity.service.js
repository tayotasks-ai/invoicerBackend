const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const Entity = require("../models/entity.model");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const bankRepository = require("../repo/bankAccount.repo");
const entityRepository = require("../repo/entity.repo");
const invoiceRepository = require("../repo/invoice.repo");
const { PaystackPaymentGateway, generatePaystackReference } = require("../utils/paystack.utils");
const jwt = require("jsonwebtoken");
const Authorization = require("../utils/authorization.service");
const { getTheme, listThemes, DEFAULT_THEME_ID } = require("../utils/templates/themes");
const { buildSampleInvoiceData } = require("../utils/sampleInvoiceData");
const { generateInvoice } = require("../utils/invoice");
const { getPlan, listPlans, effectivePlanId } = require("../config/plans");
const { sendEmail } = require("../utils/email.util");
const { buildEmailHtml, infoRow, esc } = require("../utils/templates/emailLayout");
const SeerbitUtil = require("../utils/seerbit.utils");

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
      // invoecr takes 0% of the split - the business's subaccount gets the
      // full invoice amount. Paystack's own processing fee still applies
      // separately and is charged to the subaccount, not invoecr's main
      // account (see the `bearer: 'subaccount'` passed alongside every
      // subaccount transaction in paystack.utils.js's initiatePayment) -
      // otherwise invoecr's main balance would go negative on every
      // transaction while earning nothing from the split.
      percentage_charge: 0,
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

  // Only real images, never an arbitrary file, since these are stored
  // directly as data: URIs and printed straight into invoice HTML/PDFs.
  static _ALLOWED_IMAGE_MIMETYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

  // No cloud image host (was Cloudinary) - the uploaded file is read off
  // disk (express-fileupload's useTempFiles writes it to /tmp) and stored
  // as a base64 data: URI directly on the entity document. This keeps the
  // image self-contained with zero third-party dependency, at the cost of
  // making the entity document itself bigger - app.js caps uploads at 2MB
  // to keep that in check, since `entity` is fetched on essentially every
  // authenticated request (GET /entity/me).
  static _fileToDataUri = (file) => {
    abortIf(
      !EntityService._ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype),
      httpStatus.BAD_REQUEST,
      "Only PNG, JPEG, WebP or GIF images are allowed"
    );
    const base64 = fs.readFileSync(file.tempFilePath, { encoding: "base64" });
    // Best-effort cleanup of the temp file express-fileupload wrote to
    // /tmp - not fatal if it fails (the OS will reap /tmp eventually).
    fs.unlink(file.tempFilePath, () => {});
    return `data:${file.mimetype};base64,${base64}`;
  };

  // Stores the business logo as a base64 data: URI directly on the entity
  // so it can be printed on generated invoice PDFs with no external
  // dependency at render time.
  static addLogo = async ({ userId, file }) => {
    const entity = await entityRepository.findById(userId);
    abortIf(!entity, httpStatus.NOT_FOUND, "Entity not found");
    const dataUri = EntityService._fileToDataUri(file);
    const updated = await entityRepository.update(userId, { logo: dataUri });
    return { logo: updated.logo };
  };

  // Same as addLogo, for the signature image used to sign invoices.
  static addSignature = async ({ userId, file }) => {
    const entity = await entityRepository.findById(userId);
    abortIf(!entity, httpStatus.NOT_FOUND, "Entity not found");
    const dataUri = EntityService._fileToDataUri(file);
    const updated = await entityRepository.update(userId, { signature: dataUri });
    return { signature: updated.signature };
  };

  static editEntity = async (data) => {
    const entity = await entityRepository.findById(data.entity.id);
    abortIf(!entity, httpStatus.BAD_REQUEST, "Invalid Entity Id");

    // The 6 logo-enabled themes are a paid feature - block selecting one
    // unless the business's plan allows it (see src/config/plans.js).
    if (data.data.invoiceTemplate) {
      const theme = getTheme(data.data.invoiceTemplate);
      const plan = getPlan(effectivePlanId(entity));
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
    const plan = getPlan(effectivePlanId(entity));
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
    const plan = getPlan(effectivePlanId(entity));
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
    const plan = getPlan(effectivePlanId(entity));

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
      // Computed, not stored - true only when this account's email is on
      // the ROOT_ADMIN_EMAILS allowlist (see authorization.service.js).
      // This is the one place that tells the frontend whether to show the
      // Root link at all; the actual /admin/* routes re-check it
      // server-side regardless of what this says.
      isRoot: Authorization.isRootEmail(entity.email),
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
    // See paystack.utils.js's generatePaystackReference - this Paystack
    // account's webhook is shared with another product, so the reference
    // prefix is what lets that other platform route this event back here.
    const reference = generatePaystackReference("subscription");
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

    // Best-effort email of the temp password - tempPassword is still
    // returned in the API response below too (BusinessSettings.vue shows it
    // directly), so the invite is still usable even if email isn't
    // configured or delivery fails.
    sendEmail({
      to: email,
      subject: `You've been added to ${entity.name} on invoecr`,
      html: buildEmailHtml({
        preheader: `${entity.name} added you as a staff member on invoecr.`,
        heading: `You've been added to ${esc(entity.name)}`,
        bodyHtml: `<p style="margin:0 0 14px;">${esc(entity.name)} has added you as a staff member on their invoecr account. Sign in with:</p>
${infoRow("Email", email)}
${infoRow("Temporary password", tempPassword)}`,
        cta: { label: "Sign in to invoecr", url: process.env.APP_URL || "" },
        footnote: "We'd recommend changing this password after you sign in.",
      }),
    }).catch((error) => console.error("Failed to email staff invite:", error.message));

    return { entity: createdEntity, tempPassword };
  };

  // Activates a dedicated Seerbit virtual account for this business (see
  // src/utils/seerbit.utils.js). `bankVerificationNumber` is a one-shot,
  // request-only value: it's forwarded to Seerbit inside
  // SeerbitUtil.createVirtualAccount and is never written to `entity`,
  // logged, or returned from this method - only the resulting account
  // details are persisted, on the `virtualAccount` subdocument, which has
  // no bvn field at all (see entity.model.js).
  static provisionVirtualAccount = async ({ userId, bankVerificationNumber }) => {
    const entity = await entityRepository.findById(userId);
    abortIf(!entity, httpStatus.NOT_FOUND, "Entity not found");
    abortIf(
      entity.virtualAccount?.status === "active",
      httpStatus.BAD_REQUEST,
      "A virtual account is already active for this business"
    );
    abortIf(
      !SeerbitUtil.isConfigured(),
      httpStatus.SERVICE_UNAVAILABLE,
      "Virtual accounts aren't available yet - this business hasn't finished setting up its banking partner."
    );

    const reference = "va_" + crypto.randomUUID().split("-").join("").slice(0, 20);

    try {
      const result = await SeerbitUtil.createVirtualAccount({
        fullName: entity.name,
        email: entity.email,
        reference,
        currency: "NGN",
        bankVerificationNumber,
      });
      const updated = await entityRepository.update(userId, {
        virtualAccount: {
          provider: "seerbit",
          status: "active",
          accountNumber: result.accountNumber,
          bankName: result.bankName,
          accountName: result.accountName,
          reference: result.reference,
          error: null,
          createdAt: new Date(),
        },
      });
      return updated.virtualAccount;
    } catch (error) {
      // error.message here is either Seerbit's own rejection reason (e.g.
      // "Invalid BVN") or a generic transport error - never the raw
      // request/response, which could echo the BVN back. Safe to log.
      console.error(`provisionVirtualAccount failed for entity ${userId}:`, error.message);
      await entityRepository.update(userId, {
        virtualAccount: {
          provider: "seerbit",
          status: "failed",
          accountNumber: null,
          bankName: null,
          accountName: null,
          reference,
          error: error.message,
          createdAt: new Date(),
        },
      });
      abortIf(true, httpStatus.BAD_GATEWAY, `Couldn't activate your virtual account: ${error.message}`);
    }
  };
}

module.exports = {
  EntityService,
};
