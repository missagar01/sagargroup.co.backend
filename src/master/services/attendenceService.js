import axios from "axios";
import pool from "../config/db.js";

function getAttendanceConfig() {
    const baseUrl =
        process.env.ATTENDANCE_API_URL ||
        process.env.ATTENDENCE_API_URL ||
        null;

    const apiKey =
        process.env.ATTENDANCE_API_KEY ||
        process.env.ATTENDENCE_API_KEY ||
        null;

    return { baseUrl, apiKey };
}

function buildAttendanceUrl(baseUrl, apiKey, fromDate, toDate) {
    const parsedUrl = new URL(baseUrl);
    if (apiKey) parsedUrl.searchParams.set("APIKey", apiKey);
    parsedUrl.searchParams.set("FromDate", fromDate);
    parsedUrl.searchParams.set("ToDate", toDate);
    return parsedUrl.toString();
}

export const fetchAttendanceSummary = async () => {
    const today = new Date()
        .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const firstDayOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
    ).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const { baseUrl, apiKey } = getAttendanceConfig();

    // Attendance integration is optional. Return an empty list if not configured.
    if (!baseUrl) return [];

    let apiRes;
    try {
        const apiUrl = buildAttendanceUrl(baseUrl, apiKey, firstDayOfMonth, today);
        apiRes = await axios.get(apiUrl, { timeout: 15000 });
    } catch (error) {
        // Fail gracefully so dashboard API remains stable even if attendance API is down/misconfigured.
        console.warn("Attendance API unavailable:", error.message);
        return [];
    }

    const raw = apiRes.data;
    const logs = Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw)
            ? raw
            : [];

    if (!logs.length) return [];

    const { rows } = await pool.query(
        `SELECT employee_id FROM users WHERE employee_id IS NOT NULL`
    );

    const employeeSet = new Set(rows.map(r => String(r.employee_id).trim()));
    const grouped = {};

    for (const log of logs) {
        if (!log?.EmployeeCode || !log?.LogDate) continue;

        const empId = String(log.EmployeeCode).trim();
        if (!employeeSet.has(empId)) continue;

        const dayKey = log.LogDate.split(" ")[0];
        if (dayKey < firstDayOfMonth || dayKey > today) continue;

        const isIn =
            log.PunchDirection === 1 ||
            String(log.PunchDirection).toLowerCase() === "in";

        if (!isIn) continue;

        if (!grouped[empId]) grouped[empId] = new Set();
        grouped[empId].add(dayKey);
    }

    const response = [];

    for (const [employee_id, daySet] of Object.entries(grouped)) {
        response.push({
            employee_id,
            status: daySet.has(today) ? "IN" : "OUT",
            monthly_attendance: daySet.size,
        });
    }

    return response;
};
