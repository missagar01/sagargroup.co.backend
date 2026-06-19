import express from "express";
import {
  fetchChecklist,
  fetchDelegation,
  fetchMaintenance,
  fetchHousekeeping,
  deleteChecklistTasks,
  deleteDelegationTasks,
  deleteMaintenanceTasks,
  deleteHousekeepingTasks,
  updateChecklistTask,
  updateDelegationTask,
  updateMaintenanceTask,
  fetchUsers
} from "../controllers/quickTaskController.js";

const router = express.Router();

router.post("/checklist", async (req, res) => {
  const result = await fetchChecklist(
    req.body.page,
    req.body.pageSize,
    req.body.nameFilter,
    req.body.startDate,
    req.body.endDate
  );
  res.json(result);
});

router.post("/delegation", async (req, res) => {
  const result = await fetchDelegation(
    req.body.page,
    req.body.pageSize,
    req.body.nameFilter,
    req.body.startDate,
    req.body.endDate
  );
  res.json(result);
});

router.post("/maintenance", async (req, res) => {
  const result = await fetchMaintenance(
    req.body.page,
    req.body.pageSize,
    req.body.nameFilter,
    req.body.startDate,
    req.body.endDate
  );
  res.json(result);
});

router.post("/housekeeping", async (req, res) => {
  const result = await fetchHousekeeping(
    req.body.page,
    req.body.pageSize,
    req.body.nameFilter,
    req.body.startDate,
    req.body.endDate
  );
  res.json(result);
});

router.post("/delete-checklist", async (req, res) => {
  try {
    const result = await deleteChecklistTasks(req.body.tasks);
    res.json(result);
  } catch (error) {
    console.error("Error in delete-checklist route:", error);
    res.status(400).json({ error: error.message || "Failed to delete checklist task" });
  }
});

router.post("/delete-delegation", async (req, res) => {
  try {
    const result = await deleteDelegationTasks(req.body.taskIds);
    res.json(result);
  } catch (error) {
    console.error("Error in delete-delegation route:", error);
    res.status(400).json({ error: error.message || "Failed to delete delegation task" });
  }
});

router.post("/delete-maintenance", async (req, res) => {
  try {
    const result = await deleteMaintenanceTasks(req.body.taskIds);
    res.json(result);
  } catch (error) {
    console.error("Error in delete-maintenance route:", error);
    res.status(400).json({ error: error.message || "Failed to delete maintenance task" });
  }
});

router.post("/delete-housekeeping", async (req, res) => {
  try {
    const result = await deleteHousekeepingTasks(req.body.taskIds);
    res.json(result);
  } catch (error) {
    console.error("Error in delete-housekeeping route:", error);
    res.status(400).json({ error: error.message || "Failed to delete housekeeping task" });
  }
});

router.post("/update-checklist", async (req, res) => {
  try {
    const { updatedTask, originalTask } = req.body;
    
    if (!updatedTask) {
      return res.status(400).json({ error: "updatedTask is required" });
    }

    if (!updatedTask.task_id) {
      return res.status(400).json({ error: "task_id is required in updatedTask" });
    }

    const result = await updateChecklistTask(updatedTask, originalTask);
    res.json(result);
  } catch (error) {
    console.error("Error in update-checklist route:", error);
    res.status(500).json({ error: error.message || "Failed to update checklist task" });
  }
});

router.post("/update-delegation", async (req, res) => {
  try {
    const { updatedTask } = req.body;

    if (!updatedTask) {
      return res.status(400).json({ error: "updatedTask is required" });
    }

    if (!updatedTask.task_id) {
      return res.status(400).json({ error: "task_id is required in updatedTask" });
    }

    const result = await updateDelegationTask(updatedTask);
    res.json(result);
  } catch (error) {
    console.error("Error in update-delegation route:", error);
    res.status(500).json({ error: error.message || "Failed to update delegation task" });
  }
});

router.post("/update-maintenance", async (req, res) => {
  try {
    const { updatedTask } = req.body;

    if (!updatedTask) {
      return res.status(400).json({ error: "updatedTask is required" });
    }

    if (!updatedTask.task_id) {
      return res.status(400).json({ error: "task_id is required in updatedTask" });
    }

    const result = await updateMaintenanceTask(updatedTask);
    res.json(result);
  } catch (error) {
    console.error("Error in update-maintenance route:", error);
    res.status(500).json({ error: error.message || "Failed to update maintenance task" });
  }
});

router.get("/users", async (req, res) => {
  const result = await fetchUsers();
  res.json(result);
});

export default router;
