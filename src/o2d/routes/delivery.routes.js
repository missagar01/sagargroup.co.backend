const { Router } = require("express");
const deliveryController = require("../controllers/delivery.controller.js");

const router = Router();

router.get("/stats", deliveryController.getDeliveryStats);
router.get("/report", deliveryController.getDeliveryReport);
router.get("/stats/salesperson", deliveryController.getSalespersonDeliveryStats);


module.exports = router;
