import * as departmentService from '../services/department.service.js';

/**
 * Fetches HOD info for a department
 */
export async function getHODInfo(req, res) {
  const { department } = req.params;
  try {
    const hod = await departmentService.getHODByDepartment(department);
    if (!hod) {
      return res.status(404).json({ success: false, message: 'HOD not found for this department' });
    }
    return res.json({ success: true, data: hod });
  } catch (error) {
    console.error("getHODInfo error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}









