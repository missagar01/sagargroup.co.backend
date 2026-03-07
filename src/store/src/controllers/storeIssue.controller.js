import * as storeIssueService from "../services/storeIssue.service.js";

/**
 * Get all store issues
 */
export const getIssues = async (req, res) => {
    try {
        const result = await storeIssueService.getStoreIssues();
        return res.status(200).json(result);
    } catch (err) {
        console.error("Controller Error (getIssues):", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch Store Issue data",
            error: err.message
        });
    }
};
