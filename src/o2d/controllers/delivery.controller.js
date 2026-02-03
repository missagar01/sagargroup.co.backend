const deliveryService = require("../services/delivery.service.js");

async function getDeliveryStats(req, res) {
    try {
        const { startDate, endDate } = req.query;
        const stats = await deliveryService.getDeliveryStats({ startDate, endDate });
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error("Controller Error - getDeliveryStats:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch delivery statistics",
            error: error.message
        });
    }
}

module.exports = {
    getDeliveryStats
};
