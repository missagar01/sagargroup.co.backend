const express = require('express');
const leaveRequestController = require('../controllers/leaveRequestController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/', leaveRequestController.listLeaveRequests.bind(leaveRequestController));
router.get('/status/:status', leaveRequestController.listLeaveRequestsByApprovedStatus.bind(leaveRequestController));
router.get('/:id', leaveRequestController.getLeaveRequest.bind(leaveRequestController));
router.post('/', leaveRequestController.createLeaveRequest.bind(leaveRequestController));
router.put('/:id', leaveRequestController.updateLeaveRequest.bind(leaveRequestController));
router.delete('/:id', leaveRequestController.deleteLeaveRequest.bind(leaveRequestController));

module.exports = router;
