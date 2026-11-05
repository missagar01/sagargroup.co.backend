import express from "express";
import {
  getUniqueDepartments,
  getUniqueDivisions,
  getUserProfile,
  getUniqueGivenBy,
  getUniqueDoerNames,
  getWorkingDays,
  postAssignTasks
} from "../controllers/assignTaskController.js";

const router = express.Router();

// Departments
router.get("/departments/:user_name", getUniqueDepartments);

// Divisions
router.get("/divisions", getUniqueDivisions);

// User profile for non-admin auto-fill
router.get("/user-profile/:user_name", getUserProfile);

// Given By
router.get("/given-by", getUniqueGivenBy);

// Doer Names
router.get("/doer/:department", getUniqueDoerNames);

// Working Days
router.get("/working-days", getWorkingDays);

// Insert Tasks
router.post("/assign", postAssignTasks);

export default router;
