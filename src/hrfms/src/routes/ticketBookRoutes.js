const express = require('express');
const ticketBookController = require('../controllers/ticketBookController');
const { upload } = require('../utils/upload');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/', ticketBookController.getAllTickets.bind(ticketBookController));
router.get('/:id', ticketBookController.getTicketById.bind(ticketBookController));
router.post('/', upload.single('upload_bill_image'), ticketBookController.createTicket.bind(ticketBookController));
router.put('/:id', upload.single('upload_bill_image'), ticketBookController.updateTicket.bind(ticketBookController));
router.delete('/:id', authorizeRoles('Admin'), ticketBookController.deleteTicket.bind(ticketBookController));

module.exports = router;

