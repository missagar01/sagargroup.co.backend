import * as departmentService from '../services/department.service.js';

export async function getDepartments(req, res) {
  try {
    const departments = await departmentService.getAllDepartments();
    res.json({ success: true, data: departments });
  } catch (error) {
    console.error("getDepartments error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function createDepartment(req, res) {
  try {
    const department = await departmentService.createDepartment(req.body);
    res.status(201).json({ success: true, data: department });
  } catch (error) {
    console.error("createDepartment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function updateDepartment(req, res) {
  const { id } = req.params;
  try {
    const department = await departmentService.updateDepartment(id, req.body);
    if (!department) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }
    res.json({ success: true, data: department });
  } catch (error) {
    console.error("updateDepartment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function deleteDepartment(req, res) {
  const { id } = req.params;
  try {
    await departmentService.deleteDepartment(id);
    res.json({ success: true, message: "Department deleted successfully" });
  } catch (error) {
    console.error("deleteDepartment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
