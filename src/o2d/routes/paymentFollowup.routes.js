const { Router } = require("express");
const paymentFollowupController = require("../controllers/paymentFollowup.controller.js");

const router = Router();

router.get("/", paymentFollowupController.getInvoices);
router.put("/:vrno", paymentFollowupController.updateStatus);

module.exports = router;
