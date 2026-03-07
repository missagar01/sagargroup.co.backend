const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/', dashboardController.getDashboardData.bind(dashboardController));
router.get('/employee/:employeeId', dashboardController.getEmployeeDetails.bind(dashboardController));

module.exports = router;

