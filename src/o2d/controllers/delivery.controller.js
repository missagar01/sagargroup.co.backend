const deliveryService = require("../services/delivery.service.js");

async function getDeliveryStats(req, res) {
    try {
        const { startDate, endDate, salesPerson } = req.query;
        const stats = await deliveryService.getDeliveryStats({ startDate, endDate, salesPerson });
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

async function getDeliveryReport(req, res) {
    try {
        const { startDate, endDate, salesPerson } = req.query;
        const report = await deliveryService.getDeliveryReport({ startDate, endDate, salesPerson });
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error("Controller Error - getDeliveryReport:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch delivery report",
            error: error.message
        });
    }
}

async function getSalespersonDeliveryStats(req, res) {
    try {
        const { startDate, endDate } = req.query;
        const stats = await deliveryService.getSalespersonDeliveryStats({ startDate, endDate });
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error("Controller Error - getSalespersonDeliveryStats:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch salesperson delivery statistics",
            error: error.message
        });
    }
}

module.exports = {
    getDeliveryStats,
    getDeliveryReport,
    getSalespersonDeliveryStats
};


