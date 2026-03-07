import pool from "../config/db.js";
import axios from "axios";

export const fetchVisitsForApprovalService = async (personToMeet) => {
    try {
        const query = `
            SELECT
                id,
                visitor_name,
                mobile_number,
                visitor_photo,
                visitor_address,
                purpose_of_visit,
                person_to_meet,
                date_of_visit,
                time_of_entry,
                approval_status
            FROM visitors
            WHERE person_to_meet = $1
            ORDER BY created_at DESC
        `;

        const { rows } = await pool.query(query, [personToMeet]);
        return rows;
    } catch (err) {
        err.message = "Failed to fetch approval visits";
        throw err;
    }
};

export const updateVisitApprovalService = async (id, status, approvedBy) => {
    try {
        const query = `
            UPDATE visitors
            SET
                approval_status = $1,
                approved_by = $2,
                approved_at = NOW()
            WHERE id = $3
            RETURNING visitor_name, person_to_meet
        `;

        const result = await pool.query(query, [status, approvedBy, id]);

        if (!result.rowCount) {
            const error = new Error("Visitor not found");
            error.statusCode = 404;
            throw error;
        }

        return result.rows[0];
    } catch (err) {
        if (!err.statusCode) {
            err.message = "Failed to update approval status";
        }
        throw err;
    }
};

export const sendApprovalWhatsappMessage = async (message) => {
    try {
        await axios.post(
            `${process.env.MAYTAPI_BASE_URL}/${process.env.MAYTAPI_PRODUCT_ID}/${process.env.MAYTAPI_PHONE_ID}/sendMessage`,
            {
                to_number: process.env.WHATSAPP_GROUP_ID,
                message,
                type: "text"
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-maytapi-key": process.env.MAYTAPI_API_KEY
                },
                timeout: 10000
            }
        );
    } catch (err) {
        // Non-blocking error (won’t crash request)
        console.error("⚠️WhatsApp send failed:", err.message);
    }
};
