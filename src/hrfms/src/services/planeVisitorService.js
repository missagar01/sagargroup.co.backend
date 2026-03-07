const planeVisitorModel = require('../models/planeVisitorModel');

class PlaneVisitorService {
  async getAllVisitors() {
    try {
      return await planeVisitorModel.findAll();
    } catch (error) {
      throw new Error(`Failed to fetch plane visitors: ${error.message}`);
    }
  }

  async getVisitorById(id) {
    try {
      const visitor = await planeVisitorModel.findById(id);
      if (!visitor) {
        throw new Error('Plane visitor not found');
      }
      return visitor;
    } catch (error) {
      throw error;
    }
  }

  async createVisitor(data) {
    try {
      const normalized = this.prepareNewVisitorData(data);
      this.validateVisitorData(normalized);
      return await planeVisitorModel.create(normalized);
    } catch (error) {
      throw new Error(`Failed to create plane visitor: ${error.message}`);
    }
  }

  async updateVisitor(id, data) {
    try {
      const existingVisitor = await planeVisitorModel.findById(id);
      if (!existingVisitor) {
        throw new Error('Plane visitor not found');
      }
      const normalized = this.prepareUpdateVisitorData(data);
      const merged = { ...existingVisitor, ...normalized };
      this.validateVisitorData(merged);
      return await planeVisitorModel.update(id, normalized);
    } catch (error) {
      throw error;
    }
  }

  async deleteVisitor(id) {
    try {
      const existingVisitor = await planeVisitorModel.findById(id);
      if (!existingVisitor) {
        throw new Error('Plane visitor not found');
      }
      return await planeVisitorModel.delete(id);
    } catch (error) {
      throw error;
    }
  }

  prepareNewVisitorData(data) {
    const normalized = this.normalizeVisitorData(data);
    if (!normalized.request_status) {
      normalized.request_status = 'PENDING';
    }
    return normalized;
  }

  prepareUpdateVisitorData(data) {
    return this.normalizeVisitorData(data, { forUpdate: true });
  }

  normalizeVisitorData(data, options = {}) {
    const { forUpdate = false } = options;
    const fields = [
      'person_name',
      'employee_code',
      'reason_for_visit',
      'no_of_person',
      'from_date',
      'to_date',
      'requester_name',
      'approv_employee_code',
      'approve_by_name',
      'request_for',
      'remarks',
      'request_status'
    ];

    const normalized = {};

    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        let value = data[field];
        if (typeof value === 'string') {
          value = value.trim();
          if (value === '') {
            value = null;
          }
        }

        if (field === 'no_of_person' && value !== null && value !== undefined) {
          const parsed = parseInt(value, 10);
          value = Number.isNaN(parsed) ? null : parsed;
        }

        normalized[field] = value;
      } else if (!forUpdate) {
        normalized[field] = null;
      }
    });

    return normalized;
  }

  validateVisitorData(data) {
    if (data.from_date && data.to_date) {
      const from = new Date(data.from_date);
      const to = new Date(data.to_date);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new Error('Invalid date format for visit window');
      }
      if (from > to) {
        throw new Error('from_date cannot be after to_date');
      }
    }

    if (data.no_of_person !== null && data.no_of_person !== undefined) {
      if (Number.isNaN(data.no_of_person) || data.no_of_person < 1) {
        throw new Error('no_of_person must be a positive integer');
      }
    }
  }
}

module.exports = new PlaneVisitorService();
