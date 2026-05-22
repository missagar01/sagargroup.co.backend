const express = require('express');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

router.get('/status', dashboardController.getStatus);
router.get('/live', dashboardController.getLive);
router.get('/summary', dashboardController.getSummary);
router.get('/messages', dashboardController.getMessages);
router.post('/config', dashboardController.updateConfig);
router.post('/publish', dashboardController.publishMessage);
router.post('/clear-history', dashboardController.clearHistory);

module.exports = router;
