const express = require('express');
const requestController = require('../controllers/requestController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.post('/', requestController.createRequest.bind(requestController));

router.get('/', requestController.getAllRequests.bind(requestController));
router.get('/:id', requestController.getRequestById.bind(requestController));
router.put('/:id', requestController.updateRequest.bind(requestController));
router.delete('/:id', requestController.deleteRequest.bind(requestController));

module.exports = router;

