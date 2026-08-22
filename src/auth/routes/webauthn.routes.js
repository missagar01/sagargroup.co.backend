const { Router } = require("express");
const { authenticate } = require("../../o2d/middleware/auth.js");
const {
  registerOptions,
  registerVerify,
  loginOptions,
  loginVerify,
  registerFace,
  loginFace,
} = require("../controllers/webauthn.controller.js");

const router = Router();

// Registration routes (require authentication)
router.get("/register-options", authenticate, registerOptions);
router.post("/register-verify", authenticate, registerVerify);
router.post("/register-face", authenticate, registerFace);

// Authentication (Login) routes (public)
router.post("/login-options", loginOptions);
router.post("/login-verify", loginVerify);
router.post("/login-face", loginFace);

module.exports = router;
