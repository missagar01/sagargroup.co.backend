import * as service from "../services/repairFollowup.service.js";

/* CREATE */
export async function create(req, res) {
    try {
        const data = await service.createRepairFollowup(req.body);
        res.status(201).json({ success: true, data });
    } catch (err) {
        console.error("Create error:", err);
        res.status(500).json({ success: false, message: "Create failed" });
    }
}

/* READ ALL */
export async function getAll(req, res) {
    try {
        const data = await service.getAllRepairFollowups();
        res.json({ success: true, data });
    } catch (err) {
        console.error("Fetch error:", err);
        res.status(500).json({ success: false, message: "Fetch failed" });
    }
}

/* READ BY ID */
export async function getById(req, res) {
    try {
        const data = await service.getRepairFollowupById(req.params.id);
        if (!data) {
            return res.status(404).json({ success: false, message: "Record not found" });
        }
        res.json({ success: true, data });
    } catch (err) {
        console.error("Fetch by id error:", err);
        res.status(500).json({ success: false, message: "Fetch failed" });
    }
}

/* UPDATE */
export async function update(req, res) {
    try {
        const data = await service.updateRepairFollowup(req.params.id, req.body);
        if (!data) {
            return res.status(404).json({ success: false, message: "Record not found" });
        }
        res.json({ success: true, data });
    } catch (err) {
        console.error("Update error:", err);
        res.status(500).json({ success: false, message: "Update failed" });
    }
}

/* DELETE */
export async function remove(req, res) {
    try {
        await service.deleteRepairFollowup(req.params.id);
        res.json({ success: true, message: "Deleted successfully" });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ success: false, message: "Delete failed" });
    }
}


export async function updateStage2(req, res) {
    try {
        const data = await service.updateStage2ById(
            req.params.id,
            req.body
        );

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Record not found",
            });
        }

        res.json({ success: true, data });
    } catch (err) {
        console.error("Stage2 update error:", err);
        res.status(500).json({
            success: false,
            message: "Stage2 update failed",
        });
    }
}

