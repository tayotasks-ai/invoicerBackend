const bcrypt = require("bcryptjs");
const Entity = require("../models/entity.model");
const { abortIf } = require("../utils/responder");
const httpStatus = require("http-status").default;
const entityRepository = require("../repo/entity.repo");
const jwt = require("jsonwebtoken");
const Authorization = require("../utils/authorization.service");

class AuthService {
  // Public self-signup always creates the tenant-root "business" entity, not
  // a staff member - staff accounts are only ever created via
  // EntityService.addMember (see entity.service.js), which explicitly passes
  // type: "staff" and a parent_id. Defaulting this to "staff" would create
  // parentless staff accounts with no owning business, which is meaningless.
  static signup = async ({
    name,
    email,
    password,
    type = "business",
    phone,
    first_name,
    last_name,
    logo,
    address,
  }) => {
    const existingEntity = await entityRepository.findOne({ query: { email } });
    abortIf(existingEntity, httpStatus.BAD_REQUEST, "Entity already exists");
    const hashedPassword = await bcrypt.hash(password, 10);
    const entity = await entityRepository.create({
      name,
      email,
      password: hashedPassword,
      type,
      phone,
      first_name,
      last_name,
      logo,
      address,
    });
    //generate token
    // NOTE: Authorization.generateToken() returns {success, token, expiresIn},
    // not a bare JWT string - unwrap .token here, otherwise the frontend ends
    // up storing "[object Object]" as its auth token, which fails
    // verification on the very next request and looks like an instant logout.
    const { token } = Authorization.generateToken({
      id: entity._id,
      email: entity.email,
    });
    return { entity, token };
  };
  static signIn = async (email, password) => {
    const entity = await entityRepository.findOne({ query: { email } });
    abortIf(!entity, httpStatus.NOT_FOUND, "Entity not found");
    const isMatch = await bcrypt.compare(password, entity.password);
    abortIf(!isMatch, httpStatus.BAD_REQUEST, "Invalid credentials");
    const { token } = Authorization.generateToken({
      id: entity._id,
      email: entity.email,
    });
    return { entity, token };
  };
}

module.exports = {
  AuthService,
};
