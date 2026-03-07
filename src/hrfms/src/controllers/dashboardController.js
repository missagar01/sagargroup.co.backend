const dashboardService = require('../services/dashboardService');

class DashboardController {
  async getDashboardData(req, res, next) {
    try {
      // Check if it's an employee request (non-admin)
      // Normalized role check
      const isAdmin = (req.user?.role || '').toLowerCase() === 'admin' || req.user?.Admin === 'Yes';

      if (!isAdmin) {
        const { month } = req.query;
        const employeeId = req.user.employee_id;
        const userId = req.user.id;
        const data = await dashboardService.getEmployeeDashboardStats(userId, employeeId, month);
        return res.status(200).json({
          success: true,
          data
        });
      }

      // Admin request
      const data = await dashboardService.getDashboardStats();
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  }
  async getEmployeeDetails(req, res, next) {
    try {
      const { employeeId } = req.params;
      const data = await dashboardService.getEmployeeDetails(employeeId);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new DashboardController();
