const { Router } = require("express");
const deliveryController = require("../controllers/delivery.controller.js");

const router = Router();

router.get("/stats", deliveryController.getDeliveryStats);

module.exports = router;
