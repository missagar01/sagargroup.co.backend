const planeVisitorService = require('../services/planeVisitorService');

class PlaneVisitorController {
  async getAllVisitors(req, res, next) {
    try {
      const visitors = await planeVisitorService.getAllVisitors();
      res.status(200).json({
        success: true,
        data: visitors,
        count: visitors.length
      });
    } catch (error) {
      next(error);
    }
  }

  async getVisitorById(req, res, next) {
    try {
      const { id } = req.params;
      const visitor = await planeVisitorService.getVisitorById(id);
      res.status(200).json({
        success: true,
        data: visitor
      });
    } catch (error) {
      if (error.message === 'Plane visitor not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async createVisitor(req, res, next) {
    try {
      const visitor = await planeVisitorService.createVisitor(req.body);
      res.status(201).json({
        success: true,
        message: 'Plane visitor created successfully',
        data: visitor
      });
    } catch (error) {
      next(error);
    }
  }

  async updateVisitor(req, res, next) {
    try {
      const { id } = req.params;
      const visitor = await planeVisitorService.updateVisitor(id, req.body);
      res.status(200).json({
        success: true,
        message: 'Plane visitor updated successfully',
        data: visitor
      });
    } catch (error) {
      if (error.message === 'Plane visitor not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async deleteVisitor(req, res, next) {
    try {
      const { id } = req.params;
      await planeVisitorService.deleteVisitor(id);
      res.status(200).json({
        success: true,
        message: 'Plane visitor deleted successfully'
      });
    } catch (error) {
      if (error.message === 'Plane visitor not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }
}

module.exports = new PlaneVisitorController();
