const ticketBookModel = require('../models/ticketBookModel');
const { getImageUrl } = require('../utils/upload');
const { getOrSetCache, invalidateCache } = require('../utils/cache');

class TicketBookService {
  async getAllTickets() {
    return getOrSetCache('tickets:all', 10, async () => {
      try {
        const tickets = await ticketBookModel.findAll();
        // Convert image filenames to URLs
        return tickets.map(ticket => ({
          ...ticket,
          upload_bill_image: ticket.upload_bill_image ? getImageUrl(ticket.upload_bill_image) : null
        }));
      } catch (error) {
        throw new Error(`Failed to fetch tickets: ${error.message}`);
      }
    });
  }

  async getTicketById(id) {
    try {
      const ticket = await ticketBookModel.findById(id);
      if (!ticket) {
        throw new Error('Ticket not found');
      }
      // Convert image filename to URL
      return {
        ...ticket,
        upload_bill_image: ticket.upload_bill_image ? getImageUrl(ticket.upload_bill_image) : null
      };
    } catch (error) {
      throw error;
    }
  }

  async createTicket(data, imageFile) {
    try {
      // Validate required fields
      this.validateTicketData(data);

      // Handle image upload
      if (imageFile) {
        data.upload_bill_image = imageFile.filename;
      }

      const ticket = await ticketBookModel.create(data);

      // Invalidate Caches
      await Promise.all([
        invalidateCache('dashboard:admin:global'),
        invalidateCache('tickets:*')
      ]);

      // Convert image filename to URL
      return {
        ...ticket,
        upload_bill_image: ticket.upload_bill_image ? getImageUrl(ticket.upload_bill_image) : null
      };
    } catch (error) {
      throw new Error(`Failed to create ticket: ${error.message}`);
    }
  }

  async updateTicket(id, data, imageFile) {
    try {
      const existingTicket = await ticketBookModel.findById(id);
      if (!existingTicket) {
        throw new Error('Ticket not found');
      }

      // Handle image upload
      if (imageFile) {
        data.upload_bill_image = imageFile.filename;
      }

      const ticket = await ticketBookModel.update(id, data);

      // Invalidate Caches
      await Promise.all([
        invalidateCache('dashboard:admin:global'),
        invalidateCache('tickets:*')
      ]);

      // Convert image filename to URL
      return {
        ...ticket,
        upload_bill_image: ticket.upload_bill_image ? getImageUrl(ticket.upload_bill_image) : null
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteTicket(id) {
    try {
      const existingTicket = await ticketBookModel.findById(id);
      if (!existingTicket) {
        throw new Error('Ticket not found');
      }
      const result = await ticketBookModel.delete(id);
      // Invalidate Caches
      await Promise.all([
        invalidateCache('dashboard:admin:global'),
        invalidateCache('tickets:*')
      ]);
      return result;
    } catch (error) {
      throw error;
    }
  }

  validateTicketData(data) {
    // Validate numeric fields
    const numericFields = ['charges', 'per_ticket_amount', 'total_amount'];
    for (const field of numericFields) {
      if (data[field] && (isNaN(data[field]) || parseFloat(data[field]) < 0)) {
        throw new Error(`${field} must be a positive number`);
      }
    }
  }
}

module.exports = new TicketBookService();
