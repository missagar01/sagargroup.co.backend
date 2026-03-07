import * as threePartyService from "../services/threePartyApproval.service.js";

// 🟢 Pending list
export async function getPendingApprovals(req, res) {
  try {
    const data = await threePartyService.getPendingApprovals();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 🟠 History list
export async function getApprovalHistory(req, res) {
  try {
    const data = await threePartyService.getApprovalHistory();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 🔵 Approve vendor
export async function approveVendor(req, res) {
  try {
    const { indentNumber, vendorName, rate, paymentTerm } = req.body;
    const result = await threePartyService.approveVendor(indentNumber, vendorName, rate, paymentTerm);
    res.json(result);
  } catch (err) {
    console.error("❌ Error approving vendor:", err);
    res.status(500).json({ error: err.message });
  }
}
