import {
  fetchRepairTasks,
  updateStoreIn
} from "../services/storeInServices.js";

export const getAllTasks = async (req, res) => {
  try {
    const tasks = await fetchRepairTasks();
    res.json({ success: true, tasks });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateStoreInDetails = async (req, res) => {
  try {
    const { taskNo } = req.params;
    const data = req.body;

    const updated = await updateStoreIn(taskNo, data);

    res.json({
      success: true,
      message: "Store-In data updated",
      updated,
    });
  } catch (err) {
    console.error("Error updating store-in:", err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};
