const { Router } = require("express");
const enquiryPipelineController = require("../controllers/enquiryPipeline.controller.js");

const router = Router();

router.get("/", enquiryPipelineController.getAllEnquiries);
router.get("/:id", enquiryPipelineController.getEnquiry);
router.post("/", enquiryPipelineController.createEnquiry);
router.patch("/:id/stage/:stage/complete", enquiryPipelineController.completeStage);

module.exports = router;
