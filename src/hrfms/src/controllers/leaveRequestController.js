const leaveRequestService = require('../services/leaveRequestService');

class LeaveRequestController {
  normalizeBody(body) {
    if (body && typeof body === 'object') {
      return body;
    }
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  async listLeaveRequests(req, res, next) {
    try {
      const leaveRequests = await leaveRequestService.getAllLeaveRequests();
      res.status(200).json({
        success: true,
        data: leaveRequests,
        count: leaveRequests.length
      });
    } catch (error) {
      next(error);
    }
  }

  async listLeaveRequestsByApprovedStatus(req, res, next) {
    try {
      const { status } = req.params;
      const leaveRequests = await leaveRequestService.getLeaveRequestsByApprovedStatus(status);
      res.status(200).json({
        success: true,
        data: leaveRequests,
        count: leaveRequests.length
      });
    } catch (error) {
      if (error.message === 'approved_by_status is required') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async getLeaveRequest(req, res, next) {
    try {
      const { id } = req.params;
      const leaveRequest = await leaveRequestService.getLeaveRequestById(id);
      res.status(200).json({
        success: true,
        data: leaveRequest
      });
    } catch (error) {
      if (error.message === 'Leave request not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async createLeaveRequest(req, res, next) {
    try {
      const payload = this.normalizeBody(req.body);
      if (!payload || Object.keys(payload).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Request body is empty or invalid'
        });
      }

      const leaveRequest = await leaveRequestService.createLeaveRequest(payload);
      res.status(201).json({
        success: true,
        message: 'Leave request created successfully',
        data: leaveRequest
      });
    } catch (error) {
      next(error);
    }
  }

  async updateLeaveRequest(req, res, next) {
    try {
      const { id } = req.params;
      const leaveRequest = await leaveRequestService.updateLeaveRequest(id, req.body);
      res.status(200).json({
        success: true,
        message: 'Leave request updated successfully',
        data: leaveRequest
      });
    } catch (error) {
      if (error.message === 'Leave request not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async deleteLeaveRequest(req, res, next) {
    try {
      const { id } = req.params;
      await leaveRequestService.deleteLeaveRequest(id);
      res.status(200).json({
        success: true,
        message: 'Leave request deleted successfully'
      });
    } catch (error) {
      if (error.message === 'Leave request not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }
}

module.exports = new LeaveRequestController();
