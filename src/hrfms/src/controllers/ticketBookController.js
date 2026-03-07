const ticketBookService = require('../services/ticketBookService');

class TicketBookController {
  async getAllTickets(req, res, next) {
    try {
      const tickets = await ticketBookService.getAllTickets();
      res.status(200).json({
        success: true,
        data: tickets,
        count: tickets.length
      });
    } catch (error) {
      next(error);
    }
  }

  async getTicketById(req, res, next) {
    try {
      const { id } = req.params;
      const ticket = await ticketBookService.getTicketById(id);
      res.status(200).json({
        success: true,
        data: ticket
      });
    } catch (error) {
      if (error.message === 'Ticket not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async createTicket(req, res, next) {
    try {
      const ticket = await ticketBookService.createTicket(req.body, req.file);
      res.status(201).json({
        success: true,
        message: 'Ticket created successfully',
        data: ticket
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTicket(req, res, next) {
    try {
      const { id } = req.params;
      const ticket = await ticketBookService.updateTicket(id, req.body, req.file);
      res.status(200).json({
        success: true,
        message: 'Ticket updated successfully',
        data: ticket
      });
    } catch (error) {
      if (error.message === 'Ticket not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async deleteTicket(req, res, next) {
    try {
      const { id } = req.params;
      await ticketBookService.deleteTicket(id);
      res.status(200).json({
        success: true,
        message: 'Ticket deleted successfully'
      });
    } catch (error) {
      if (error.message === 'Ticket not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }
}

module.exports = new TicketBookController();

