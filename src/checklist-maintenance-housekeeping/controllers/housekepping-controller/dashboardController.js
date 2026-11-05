import { dashboardService } from '../../services/housekepping-services/dashboardServices.js';
import logger from '../../utils/logger.js';

// Helper function to decode URL-encoded header values (handles non-ASCII characters like Hindi)
const decodeHeader = (value) => {
  if (!value) return '';
  try {
    // Decode URL-encoded values (handles non-ASCII characters)
    return decodeURIComponent(String(value));
  } catch (e) {
    // If decoding fails, return original value
    return String(value);
  }
};

// Helper function to resolve department from token or query (same logic as assignTaskController)
const parseDepartments = (value) => {
  if (!value) return [];
  if (typeof value !== 'string') return Array.isArray(value) ? value.map(d => d.replace(/\s+/g, ' ').trim()).filter(Boolean) : [];
  
  return value
    .split(',')
    .map(d => {
      const normalized = d.replace(/\s+/g, ' ').trim();
      return normalized;
    })
    .filter(Boolean);
};

const mergeDepartmentLists = (...departmentGroups) => {
  const seen = new Set();
  const merged = [];

  departmentGroups.flat().forEach((department) => {
    const normalized = String(department || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    merged.push(String(department).replace(/\s+/g, ' ').trim());
  });

  return merged;
};


const resolveDepartment = (req) => {
  // Express lowercases all header names, so 'x-user-role' becomes 'x-user-role'
  // Try both lowercase and original case for compatibility
  const role = req.headers['x-user-role'] || req.headers['X-User-Role'] || req.query?.role || '';
  const roleLower = role ? String(role).toLowerCase() : '';
  
  // Log all relevant headers for debugging
  const relevantHeaders = {
    'x-user-role': req.headers['x-user-role'],
    'x-user-department': req.headers['x-user-department'],
    'x-user-access1': req.headers['x-user-access1'],
    'x-user-access': req.headers['x-user-access'],
    'x-verify-access-dept': req.headers['x-verify-access-dept'],
    'X-User-Role': req.headers['X-User-Role'],
    'X-User-Access1': req.headers['X-User-Access1'],
    'X-User-Access': req.headers['X-User-Access']
  };
  
  // For user role, ALWAYS use user_access1 from request header or query parameter
  // IGNORE query department parameter - users cannot override their department access
  // Return all departments from user_access1 so user can see all their department data
  if (roleLower === 'user') {
    const userDepartment = decodeHeader(
      req.headers['x-user-department'] || req.headers['X-User-Department'] || ''
    );
    const userAccess1Raw = req.headers['x-user-access1'] || req.headers['X-User-Access1'] || req.query?.user_access1 || '';
    const userAccess1 = decodeHeader(userAccess1Raw);
    const userAccessRaw = req.headers['x-user-access'] || req.headers['X-User-Access'] || req.query?.user_access || '';
    const userAccess = decodeHeader(userAccessRaw);
    const verifyAccessDept = decodeHeader(
      req.headers['x-verify-access-dept'] || req.headers['X-Verify-Access-Dept'] || req.query?.verify_access_dept || ''
    );
    const departments = mergeDepartmentLists(
      parseDepartments(userDepartment),
      parseDepartments(userAccess1),
      parseDepartments(userAccess),
      parseDepartments(verifyAccessDept)
    );

    if (departments.length > 0) {
      logger.info({
        userDepartment,
        userAccess1,
        userAccess,
        verifyAccessDept,
        parsedDepartments: departments,
        departmentCount: departments.length,
        role: 'user',
        queryDept: req.query?.department,
        headers: relevantHeaders,
        note: 'Query department parameter ignored for user role - using merged housekeeping access from headers'
      }, 'User department resolved from merged housekeeping access (query dept ignored)');
      return departments;
    }
    // If no departments found, return null to show no data (user should have at least one department)
    logger.warn({ 
      role: 'user',
      queryDept: req.query?.department,
      headers: relevantHeaders,
      allHeaders: Object.keys(req.headers).filter(h => h.toLowerCase().includes('user')),
      note: 'User has no department access - returning null'
    }, 'User has no department access - returning null');
    return null;
  }

  // For admin role: Only filter if query parameter explicitly provides a department
  // If no query parameter, show ALL data (ignore headers - admin should see everything by default)
  const queryDept = req.query?.department;
  if (queryDept && queryDept !== 'all' && String(queryDept).trim() !== '') {
    const departments = parseDepartments(queryDept);
    if (departments.length > 0) {
      logger.info({ 
        queryDept, 
        parsedDepartments: departments,
        role: 'admin',
        note: 'Admin explicitly selected department from query - filtering by selected department'
      }, 'Admin selected department from query');
      return departments;
    }
  }

  // For admin: If no query parameter, return null to show ALL data
  // Do NOT use headers (user_access1) for admin - admin should see all data by default
  logger.info({ 
    role: 'admin',
    queryDept: req.query?.department,
    note: 'Admin with no explicit department filter - showing ALL data (ignoring headers)'
  }, 'Admin - No department filter - showing all data');
  return null; // No department filter - show all data
};

const dashboardController = {
  async getSummary(req, res, next) {
    try {
      // Use resolveDepartment to get department from headers/query (not JWT token)
      // This ensures user role gets filtered by user_access1 from headers
      const department = resolveDepartment(req);
      
      // Enhanced logging for debugging
      const headers = {
        'x-user-role': req.headers['x-user-role'],
        'x-user-access1': req.headers['x-user-access1'],
        'x-user-access': req.headers['x-user-access']
      };
      
      logger.info({ 
        department, 
        departmentType: Array.isArray(department) ? 'array' : typeof department,
        departmentLength: Array.isArray(department) ? department.length : 'N/A',
        queryDept: req.query?.department,
        userRole: req.headers['x-user-role'] || req.query?.role,
        userAccess1: req.headers['x-user-access1'] || req.query?.user_access1,
        userAccess: req.headers['x-user-access'] || req.query?.user_access,
        allHeaders: headers,
        note: 'Dashboard summary - filtering by department from headers/query'
      }, 'Dashboard summary request');
      
      // IMPORTANT: For user role, if no department is resolved, return zero counts
      // This prevents showing all data when user_access1 is missing
      const role = req.headers['x-user-role'] || req.headers['X-User-Role'] || req.query?.role || '';
      const roleLower = role ? String(role).toLowerCase() : '';
      
      if (roleLower === 'user' && !department) {
        logger.warn({
          role: 'user',
          headers: {
            'x-user-role': req.headers['x-user-role'],
            'x-user-access1': req.headers['x-user-access1'],
            'x-user-access': req.headers['x-user-access']
          },
          note: 'User role with no department access - returning zero counts'
        }, 'Dashboard summary - User with no departments');
        
        return res.json({
          total: 0,
          completed: 0,
          pending: 0,
          upcoming: 0,
          overdue: 0,
          progress_percent: 0
        });
      }
      
      const data = await dashboardService.summary({ 
        department,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      });
      
      // Log the result counts for verification
      logger.info({
        result: {
          total: data.total,
          completed: data.completed,
          pending: data.pending,
          upcoming: data.upcoming,
          overdue: data.overdue
        },
        department,
        departmentType: Array.isArray(department) ? 'array' : typeof department,
        departmentCount: Array.isArray(department) ? department.length : 'N/A',
        role: roleLower,
        note: 'Dashboard summary result'
      }, 'Dashboard summary response');
      
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async getDepartments(_req, res, next) {
    try {
      const departments = await dashboardService.listDepartments();
      res.json(departments);
    } catch (err) {
      next(err);
    }
  },

  // Debug endpoint to check headers and department resolution
  async debug(req, res, next) {
    try {
      const department = resolveDepartment(req);
      const role = req.headers['x-user-role'] || req.headers['X-User-Role'] || req.query?.role || '';
      const userAccess1 = req.headers['x-user-access1'] || req.headers['X-User-Access1'] || req.query?.user_access1 || '';
      
      res.json({
        role,
        userAccess1,
        department,
        departmentType: Array.isArray(department) ? 'array' : typeof department,
        departmentCount: Array.isArray(department) ? department.length : 'N/A',
        headers: {
          'x-user-role': req.headers['x-user-role'],
          'x-user-access1': req.headers['x-user-access1'],
          'x-user-access': req.headers['x-user-access'],
          'X-User-Role': req.headers['X-User-Role'],
          'X-User-Access1': req.headers['X-User-Access1'],
          'X-User-Access': req.headers['X-User-Access']
        },
        allHeaders: Object.keys(req.headers).filter(h => h.toLowerCase().includes('user')),
        query: req.query
      });
    } catch (err) {
      next(err);
    }
  }
};

export { dashboardController };
