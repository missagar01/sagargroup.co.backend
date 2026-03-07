import * as vendorRateService from "../services/vendorRate.service.js";


// 🟢 Pending list
export async function vendorRateUpdatePending(req, res) {
  try {
    const data = await vendorRateService.vendorRateUpdatePending();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 🟠 History list
export async function vendorRateUpdateHistory(req, res) {
  try {
    const data = await vendorRateService.vendorRateUpdateHistory();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 🔵 Submit/update vendors
export async function updateVendorRate(req, res) {
  try {
    console.log("🟢 Incoming Vendor Update:", req.body); // <--- ADD THIS

    const { indentNumber, vendors } = req.body;
    const result = await vendorRateService.updateVendorRate(indentNumber, vendors);
    res.json(result);
  } catch (err) {
    console.error("❌ Error updating vendor rate:", err);
    res.status(500).json({ error: err.message });
  }
}

