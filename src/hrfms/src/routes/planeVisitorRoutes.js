const express = require('express');
const planeVisitorController = require('../controllers/planeVisitorController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/', planeVisitorController.getAllVisitors.bind(planeVisitorController));
router.get('/:id', planeVisitorController.getVisitorById.bind(planeVisitorController));
router.post('/', planeVisitorController.createVisitor.bind(planeVisitorController));
router.put('/:id', planeVisitorController.updateVisitor.bind(planeVisitorController));
router.delete('/:id', planeVisitorController.deleteVisitor.bind(planeVisitorController));

module.exports = router;
