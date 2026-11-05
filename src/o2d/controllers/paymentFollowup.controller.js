const paymentFollowupService = require("../services/paymentFollowup.service.js");

function defaultFromDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function parseFromDate(value) {
  if (!value) return defaultFromDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? defaultFromDate() : parsed;
}

async function getInvoices(req, res) {
  try {
    const fromDate = parseFromDate(req.query.fromDate);
    const data = await paymentFollowupService.getInvoicePaymentFollowup(fromDate);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function updateStatus(req, res) {
  try {
    const { payment_status, remarks } = req.body;
    const { user_name, username } = req.user;

    const updated = await paymentFollowupService.upsertPaymentStatus({
      vrno: req.params.vrno,
      payment_status,
      remarks,
      updated_by: user_name || username,
    });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function bulkUpdateStatus(req, res) {
  try {
    const { vrnos, payment_status, remarks } = req.body;
    const { user_name, username } = req.user;

    const updated = await paymentFollowupService.bulkUpsertPaymentStatus({
      vrnos,
      payment_status,
      remarks,
      updated_by: user_name || username,
    });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getInvoices,
  updateStatus,
  bulkUpdateStatus,
};
