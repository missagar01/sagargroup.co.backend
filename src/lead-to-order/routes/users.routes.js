const express = require("express");
const { verifyToken } = require("../controllers/auth.controller.js");
const {
  listUsers,
  getUser,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
  getDepartments,
  getGivenBy,
} = require("../controllers/users.controller.js");

const router = express.Router();

router.use(verifyToken);

router.get("/", listUsers);
router.get("/departments", getDepartments);
router.get("/given-by", getGivenBy);
router.get("/:id", getUser);
router.post("/", createUserHandler);
router.put("/:id", updateUserHandler);
router.delete("/:id", deleteUserHandler);

module.exports = router;
