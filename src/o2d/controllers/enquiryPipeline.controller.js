const enquiryPipelineService = require("../services/enquiryPipeline.service.js");

async function createEnquiry(req, res) {
  try {
    const { name, company_name, mobile, email, requirement, sales_person } = req.body;
    if (!name || !mobile || !sales_person) {
      return res.status(400).json({
        success: false,
        message: "name, mobile and sales_person are required",
      });
    }

    const enquiry = await enquiryPipelineService.createEnquiry({
      name,
      company_name,
      mobile,
      email,
      requirement,
      sales_person,
    });
    res.status(201).json({ success: true, data: enquiry });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function getAllEnquiries(req, res) {
  try {
    const { role, user_name, username } = req.user;
    const enquiries = await enquiryPipelineService.getAllEnquiries(user_name || username, role);
    res.status(200).json({ success: true, data: enquiries });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function getEnquiry(req, res) {
  try {
    const { role, user_name, username } = req.user;
    const enquiry = await enquiryPipelineService.getEnquiryById(req.params.id, user_name || username, role);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found" });
    }
    res.status(200).json({ success: true, data: enquiry });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function completeStage(req, res) {
  try {
    const { role, user_name, username } = req.user;
    const enquiry = await enquiryPipelineService.markStageComplete(
      req.params.id,
      req.params.stage,
      user_name || username,
      role
    );
    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found" });
    }
    res.status(200).json({ success: true, data: enquiry });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

module.exports = {
  createEnquiry,
  getAllEnquiries,
  getEnquiry,
  completeStage,
};
