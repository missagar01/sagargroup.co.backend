import { fetchAttendanceSummary } from "../services/attendenceService.js";

export const getAttendanceSummary = async (req, res, next) => {
    try {
        const authUser = req.user;
        const isAdmin = authUser.role === "admin" || authUser.user_name === "admin";

        let data = await fetchAttendanceSummary();

        if (!isAdmin) {
            // Filter to only show the authenticated user's attendance record
            const empId = String(authUser.employee_id || "").trim();
            data = data.filter(
                (item) => String(item.employee_id || "").trim() === empId
            );
        }

        return res.json({ success: true, data });
    } catch (err) {
        console.error("ATTENDANCE ERROR:", err.message);
        next(err);
    }
};
