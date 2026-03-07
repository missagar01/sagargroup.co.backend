import * as storeGRNService from "../services/storeGRN.service.js";

/**
 * 🔹 GET Pending Store GRN
 */
export async function getStoreGRNPending(req, res) {
    try {
        const { rows, total } = await storeGRNService.getStoreGRNPending();

        return res.json({
            success: true,
            total,
            data: rows,
        });
    } catch (err) {
        console.error("getStoreGRNPending error:", err);

        return res.status(500).json({
            success: false,
            error: err.message || "Internal server error",
        });
    }
}
