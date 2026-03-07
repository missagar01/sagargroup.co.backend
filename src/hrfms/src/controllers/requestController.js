const requestService = require('../services/requestService');

class RequestController {
  async getAllRequests(req, res, next) {
    try {
      const requests = await requestService.getAllRequests();
      res.status(200).json({
        success: true,
        data: requests,
        count: requests.length
      });
    } catch (error) {
      next(error);
    }
  }

  async getRequestById(req, res, next) {
    try {
      const { id } = req.params;
      const request = await requestService.getRequestById(id);
      res.status(200).json({
        success: true,
        data: request
      });
    } catch (error) {
      if (error.message === 'Request not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async createRequest(req, res, next) {
    try {
      const request = await requestService.createRequest(req.body);
      res.status(201).json({
        success: true,
        message: 'Request created successfully',
        data: request
      });
    } catch (error) {
      console.error('🔴 CONTROLLER ERROR:', error.message);
      console.error('🔴 ERROR STACK:', error.stack);
      next(error);
    }
  }

  async updateRequest(req, res, next) {
    try {
      const { id } = req.params;
      const request = await requestService.updateRequest(id, req.body);
      res.status(200).json({
        success: true,
        message: 'Request updated successfully',
        data: request
      });
    } catch (error) {
      if (error.message === 'Request not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async deleteRequest(req, res, next) {
    try {
      const { id } = req.params;
      await requestService.deleteRequest(id);
      res.status(200).json({
        success: true,
        message: 'Request deleted successfully'
      });
    } catch (error) {
      if (error.message === 'Request not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }
}

module.exports = new RequestController();

