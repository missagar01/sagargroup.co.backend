const requestModel = require('../models/requestModel');
const { getOrSetCache, invalidateCache } = require('../utils/cache');

class RequestService {
  async getAllRequests() {
    return getOrSetCache('requests:all', 10, async () => {
      try {
        return await requestModel.findAll();
      } catch (error) {
        throw new Error(`Failed to fetch requests: ${error.message}`);
      }
    });
  }


  async getRequestById(id) {
    try {
      const request = await requestModel.findById(id);
      if (!request) {
        throw new Error('Request not found');
      }
      return request;
    } catch (error) {
      throw error;
    }
  }

  async createRequest(data) {
    try {
      // Normalize data: convert empty strings to null for optional fields
      const normalizedData = this.normalizeRequestData(data);

      // Validate required fields
      this.validateRequestData(normalizedData);

      const result = await requestModel.create(normalizedData);

      // Invalidate Caches
      await Promise.all([
        invalidateCache('dashboard:admin:global'),
        invalidateCache(`dashboard:user:${data.employee_code}:*`),
        invalidateCache(`dashboard:details:${data.employee_code}`),
        invalidateCache('requests:*')
      ]);

      return result;
    } catch (error) {
      console.error('🟠 SERVICE ERROR:', error.message);
      console.error('🟠 ERROR STACK:', error.stack);
      throw new Error(`Failed to create request: ${error.message}`);
    }
  }

  normalizeRequestData(data) {
    const normalized = { ...data };// Normalize city fields explicitly to keep their values when provided.
    ['from_city', 'to_city'].forEach((field) => {
      const value = normalized[field];

      // If null or undefined, set to null
      if (value === null || value === undefined) {
        normalized[field] = null; return;
      }

      // If empty string, set to null
      if (value === '') {
        normalized[field] = null; return;
      }

      // If it's a string, trim it
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          normalized[field] = trimmed;
        } else {
          normalized[field] = null;
        }
      } else {
        // If it's not a string, convert to string first, then trim
        const strValue = String(value).trim();
        if (strValue.length > 0) {
          normalized[field] = strValue;
        } else {
          normalized[field] = null;
        }
      }
    });// Convert empty strings to null for all fields
    Object.keys(normalized).forEach(key => {
      if (key !== 'from_city' && key !== 'to_city') {
        if (normalized[key] === '' || normalized[key] === undefined) {
          normalized[key] = null;
        }
      }
    });

    // Convert integer fields: empty string or null to null, otherwise parse
    const integerFields = ['no_of_person', 'request_quantity'];
    integerFields.forEach(field => {
      if (normalized[field] === '' || normalized[field] === null || normalized[field] === undefined) {
        normalized[field] = null;
      } else {
        const parsed = parseInt(normalized[field], 10);
        normalized[field] = isNaN(parsed) ? null : parsed;
      }
    });

    // Ensure request_status has a default value if empty
    if (!normalized.request_status) {
      normalized.request_status = 'Open';
    }

    return normalized;
  }

  async updateRequest(id, data) {
    try {
      const existingRequest = await requestModel.findById(id);
      if (!existingRequest) {
        throw new Error('Request not found');
      }
      // Normalize data for update as well
      const normalizedData = this.normalizeRequestData(data);
      const result = await requestModel.update(id, normalizedData);

      // Invalidate Caches
      await Promise.all([
        invalidateCache('dashboard:admin:global'),
        invalidateCache(`dashboard:user:${existingRequest.employee_code}:*`),
        invalidateCache(`dashboard:details:${existingRequest.employee_code}`),
        invalidateCache('requests:*')
      ]);

      return result;
    } catch (error) {
      throw error;
    }
  }

  async deleteRequest(id) {
    try {
      const existingRequest = await requestModel.findById(id);
      if (!existingRequest) {
        throw new Error('Request not found');
      }
      const result = await requestModel.delete(id);

      // Invalidate Caches
      await Promise.all([
        invalidateCache('dashboard:admin:global'),
        invalidateCache(`dashboard:user:${existingRequest.employee_code}:*`),
        invalidateCache(`dashboard:details:${existingRequest.employee_code}`),
        invalidateCache('requests:*')
      ]);

      return result;
    } catch (error) {
      throw error;
    }
  }

  validateRequestData(data) {
    // Only require city fields if it's a travel-related request
    // (identified by having type_of_travel or reason_for_travel)
    if (data.type_of_travel || data.reason_for_travel) {
      const cityFields = ['from_city', 'to_city'];
      cityFields.forEach((field) => {
        const value = data[field];
        if (typeof value !== 'string' || value.trim().length === 0) {
          throw new Error(`${field} is required`);
        }
      });
    }

    // Validate dates (only if both are provided)
    if (data.from_date && data.to_date) {
      const fromDate = new Date(data.from_date);
      const toDate = new Date(data.to_date);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw new Error('Invalid date format');
      }
      if (fromDate > toDate) {
        throw new Error('from_date cannot be after to_date');
      }
    }

    // Validate number of persons (only if provided and not null)
    if (data.no_of_person !== null && data.no_of_person !== undefined) {
      if (isNaN(data.no_of_person) || data.no_of_person < 1) {
        throw new Error('no_of_person must be a positive number');
      }
    }

    // Validate request quantity (only if provided and not null)
    if (data.request_quantity !== null && data.request_quantity !== undefined) {
      if (isNaN(data.request_quantity) || data.request_quantity < 1) {
        throw new Error('request_quantity must be a positive number');
      }
    }
  }
}

module.exports = new RequestService();
