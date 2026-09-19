const enquiryPipelineService = require("../services/enquiryPipeline.service.js");

function isAdminRole(role) {
  const userRole = (role || "").toString().toLowerCase();
  return userRole === "admin" || userRole === "all access";
}

function parseOrderQuantity(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0) {
    const err = new Error("order_quantity must be a non-negative number");
    err.statusCode = 400;
    throw err;
  }

  return quantity;
}

function parseRequiredOrderQuantity(value) {
  const quantity = parseOrderQuantity(value);
  if (quantity === null || quantity <= 0) {
    const err = new Error("order_quantity is required before completing close stage");
    err.statusCode = 400;
    throw err;
  }

  return quantity;
}

async function createEnquiry(req, res) {
  try {
    const { name, company_name, mobile, email, requirement, sales_person, city, state, order_quantity } = req.body;
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
      city,
      state,
      order_quantity: parseOrderQuantity(order_quantity),
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

async function updateEnquiry(req, res) {
  try {
    const { role, user_name, username } = req.user;
    const { name, company_name, mobile, email, requirement, sales_person, city, state, order_quantity } = req.body;

    if (!name || !mobile) {
      return res.status(400).json({
        success: false,
        message: "name and mobile are required",
      });
    }

    if (isAdminRole(role) && !sales_person) {
      return res.status(400).json({
        success: false,
        message: "sales_person is required",
      });
    }

    const enquiry = await enquiryPipelineService.updateEnquiry(
      req.params.id,
      {
        name,
        company_name,
        mobile,
        email,
        requirement,
        sales_person,
        city,
        state,
        order_quantity: parseOrderQuantity(order_quantity),
      },
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

async function deleteEnquiry(req, res) {
  try {
    const { role, user_name, username } = req.user;
    const enquiry = await enquiryPipelineService.deleteEnquiry(
      req.params.id,
      user_name || username,
      role
    );

    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found" });
    }

    res.status(200).json({ success: true, message: "Enquiry deleted successfully" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function completeStage(req, res) {
  try {
    const { role, user_name, username } = req.user;
    const stage = req.params.stage;
    const data =
      stage === "close"
        ? { order_quantity: parseRequiredOrderQuantity(req.body?.order_quantity) }
        : {};

    const enquiry = await enquiryPipelineService.markStageComplete(
      req.params.id,
      stage,
      user_name || username,
      role,
      data
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
  updateEnquiry,
  deleteEnquiry,
  completeStage,
};
