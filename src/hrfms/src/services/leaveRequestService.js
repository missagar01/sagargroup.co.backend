const leaveRequestModel = require('../models/leaveRequestModel');
const { invalidateCache, getOrSetCache } = require('../utils/cache');
const pool = require('../config/db');
const whatsappService = require('./whatsappService');

class LeaveRequestService {
  async getAllLeaveRequests() {
    return getOrSetCache('leaves:all', 10, async () => {
      try {
        return await leaveRequestModel.findAll();
      } catch (error) {
        throw new Error(`Failed to fetch leave requests: ${error.message}`);
      }
    });
  }

  async getLeaveRequestById(id) {
    try {
      const leaveRequest = await leaveRequestModel.findById(id);
      if (!leaveRequest) {
        throw new Error('Leave request not found');
      }
      return leaveRequest;
    } catch (error) {
      throw error;
    }
  }

  async getLeaveRequestsByApprovedStatus(status) {
    if (!status) {
      throw new Error('approved_by_status is required');
    }
    try {
      return await leaveRequestModel.findByApprovedStatus(status);
    } catch (error) {
      throw new Error(`Failed to fetch leave requests: ${error.message}`);
    }
  }

  async createLeaveRequest(data) {
    try {
      this.validateLeaveRequestData(data);
      const result = await leaveRequestModel.create(data);
      await this.invalidateDashboardCache(data.employee_id);

      // Send WhatsApp Notification to Primary Mobile Number
      if (data.mobilenumber) {
        whatsappService.sendLeaveRequestMessage(data.mobilenumber, data);
      }

      // Send WhatsApp Notification to Urgent Mobile Number
      if (data.urgent_mobilenumber && data.urgent_mobilenumber !== data.mobilenumber) {
        whatsappService.sendLeaveRequestMessage(data.urgent_mobilenumber, data, true);
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to create leave request: ${error.message}`);
    }
  }

  async updateLeaveRequest(id, data) {
    try {
      const existingLeaveRequest = await leaveRequestModel.findById(id);
      if (!existingLeaveRequest) {
        throw new Error('Leave request not found');
      }
      this.validateLeaveRequestData({ ...existingLeaveRequest, ...data });
      const result = await leaveRequestModel.update(id, data);
      await this.invalidateDashboardCache(existingLeaveRequest.employee_id);

      // Send WhatsApp Notification for status update (Approve/Reject)
      if (data.approved_by_status || data.approved_by) {
        const fullData = { ...existingLeaveRequest, ...data };
        if (fullData.mobilenumber) {
          whatsappService.sendLeaveStatusUpdate(fullData.mobilenumber, fullData);
        }
        if (fullData.urgent_mobilenumber && fullData.urgent_mobilenumber !== fullData.mobilenumber) {
          whatsappService.sendLeaveStatusUpdate(fullData.urgent_mobilenumber, fullData);
        }
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  async deleteLeaveRequest(id) {
    try {
      const existingLeaveRequest = await leaveRequestModel.findById(id);
      if (!existingLeaveRequest) {
        throw new Error('Leave request not found');
      }
      const result = await leaveRequestModel.delete(id);
      await this.invalidateDashboardCache(existingLeaveRequest.employee_id);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async invalidateDashboardCache(userPkey) {
    try {
      // 1. Invalidate Global
      await Promise.all([
        invalidateCache('dashboard:admin:global'),
        invalidateCache('leaves:*')
      ]);

      // 2. Fetch employee_id string to invalidate specific user cache
      if (userPkey) {
        const userRes = await pool.query('SELECT employee_id FROM users WHERE id = $1', [userPkey]);
        const employeeIdString = userRes.rows[0]?.employee_id;
        if (employeeIdString) {
          await Promise.all([
            invalidateCache(`dashboard:user:${employeeIdString}:*`),
            invalidateCache(`dashboard:details:${employeeIdString}`)
          ]);
        }
      }
    } catch (err) {
      console.error('Error in invalidateDashboardCache:', err.message);
    }
  }

  validateLeaveRequestData(data) {
    if (data.employee_id && typeof data.employee_id !== 'string' && typeof data.employee_id !== 'number') {
      throw new Error('employee_id must be a string or number');
    }

    if (data.from_date && data.to_date) {
      const fromDate = new Date(data.from_date);
      const toDate = new Date(data.to_date);
      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        throw new Error('from_date and to_date must be valid dates');
      }
      if (fromDate > toDate) {
        throw new Error('from_date cannot be after to_date');
      }
    }
  }
}

module.exports = new LeaveRequestService();
