// src/controllers/returnable.controller.js
import {
    getReturnableDetails as getReturnableDetailsRows,
    getReturnableStats as getReturnableStatsSnapshot,
} from "../services/returnable.service.js";

/**
 * Gets stats for returnable and non-returnable items.
 */
export async function getStats(req, res) {
    try {
        const stats = await getReturnableStatsSnapshot();
        return res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error("getReturnableStats error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch returnable stats",
        });
    }
}

/**
 * Gets detailed records for returnable and non-returnable items.
 */
export async function getDetails(req, res) {
    try {
        const details = await getReturnableDetailsRows();
        return res.json({
            success: true,
            data: details,
        });
    } catch (error) {
        console.error("getReturnableDetails error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch returnable details",
        });
    }
}
