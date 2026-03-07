const employeeService = require('../services/employeeService');

class EmployeeController {
  async listEmployees(req, res, next) {
    try {
      const employees = await employeeService.getAllEmployees();
      res.status(200).json({
        success: true,
        data: employees,
        count: employees.length
      });
    } catch (error) {
      next(error);
    }
  }

  async getEmployee(req, res, next) {
    try {
      const { id } = req.params;
      const employee = await employeeService.getEmployeeById(id);
      res.status(200).json({
        success: true,
        data: employee
      });
    } catch (error) {
      if (error.message === 'Employee not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async createEmployee(req, res, next) {
    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;
      const employee = await employeeService.createEmployee(req.body, req.files, baseUrl);
      res.status(201).json({
        success: true,
        message: 'Employee created successfully',
        data: employee
      });
    } catch (error) {
      next(error);
    }
  }

  async updateEmployee(req, res, next) {
    try {
      const { id } = req.params;
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;
      const employee = await employeeService.updateEmployee(id, req.body, req.files, baseUrl);
      res.status(200).json({
        success: true,
        message: 'Employee updated successfully',
        data: employee
      });
    } catch (error) {
      if (error.message === 'Employee not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async deleteEmployee(req, res, next) {
    try {
      const { id } = req.params;
      await employeeService.deleteEmployee(id);
      res.status(200).json({
        success: true,
        message: 'Employee deleted successfully'
      });
    } catch (error) {
      if (error.message === 'Employee not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async getDepartments(req, res, next) {
    try {
      const departments = await employeeService.getDistinctDepartments();
      res.status(200).json({
        success: true,
        data: departments,
        count: departments.length
      });
    } catch (error) {
      next(error);
    }
  }

  async getDesignations(req, res, next) {
    try {
      const designations = await employeeService.getDistinctDesignations();
      res.status(200).json({
        success: true,
        data: designations,
        count: designations.length
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EmployeeController();
