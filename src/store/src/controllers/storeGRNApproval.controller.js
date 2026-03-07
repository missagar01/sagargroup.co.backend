import * as service from "../services/storeGRNApproval.service.js";

/* =========================
   GET ALL
========================= */
export async function getAllStoreGRN(req, res) {
    try {
        const data = await service.getAllStoreGRN();

        return res.json({
            success: true,
            total: data.length,
            data,
        });
    } catch (err) {
        console.error("getAllStoreGRN error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch Store GRN data",
        });
    }
}

/* =========================
   POST: SEND BILL
========================= */
export async function sendBill(req, res) {
    try {
        const created = await service.createSendedBill(req.body);

        if (!created) {
            return res.status(409).json({
                success: false,
                message: "GRN already sent",
            });
        }

        return res.status(201).json({
            success: true,
            message: "Bill sent successfully",
            data: created,
        });
    } catch (err) {
        console.error("sendBill error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to send bill",
        });
    }
}


/* =========================
   PATCH: GM APPROVAL
========================= */
export async function approveByGM(req, res) {
    try {
        const { grnNo } = req.params;
        const updated = await service.patchApprovedByGM(grnNo);

        return res.json({
            success: true,
            message: "Approved by GM",
            data: updated,
        });
    } catch (err) {
        console.error("approveByGM error:", err);
        return res.status(500).json({
            success: false,
            message: "GM approval failed",
        });
    }
}

/* =========================
   PATCH: CLOSE BILL
========================= */
export async function closeBill(req, res) {
    try {
        const { grnNo } = req.params;
        const updated = await service.patchCloseBill(grnNo);

        return res.json({
            success: true,
            message: "Bill closed successfully",
            data: updated,
        });
    } catch (err) {
        console.error("closeBill error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to close bill",
        });
    }
}
