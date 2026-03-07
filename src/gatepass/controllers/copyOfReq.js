import pool from "../config/db.js";

export const createVisitRequest = async (req, res) => {
    try {
        const {
            visitorName,
            mobileNumber,
            visitorAddress,
            purposeOfVisit,
            personToMeet,
            dateOfVisit,
            timeOfEntry
        } = req.body;

        const visitorPhoto = req.file ? req.file.filename : null;

        if (!visitorName || !mobileNumber || !personToMeet || !dateOfVisit || !timeOfEntry) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        const query = `
            INSERT INTO visitors (
                visitor_name,
                mobile_number,
                visitor_photo,
                visitor_address,
                purpose_of_visit,
                person_to_meet,
                date_of_visit,
                time_of_entry,
                approval_status,
                status,
                gate_pass_closed
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending','IN',false)
            RETURNING id
        `;

        const values = [
            visitorName,
            mobileNumber,
            visitorPhoto,       // ✅ filename stored
            visitorAddress || null,
            purposeOfVisit || null,
            personToMeet,
            dateOfVisit,
            timeOfEntry
        ];

        const { rows } = await pool.query(query, values);

        return res.status(201).json({
            success: true,
            visitorId: rows[0].id
        });

    } catch (err) {
        console.error("Create Visit Error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

export const getAllVisitsForAdmin = async (req, res) => {
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
        visitor_out_time,
        approval_status,
        approved_by,
        approved_at,
        status,
        gate_pass_closed,
        created_at
      FROM visitors
      ORDER BY created_at DESC
    `;

        const { rows } = await pool.query(query);

        return res.status(200).json({
            success: true,
            data: rows,
        });

    } catch (err) {
        console.error("Fetch All Visits (Admin) Error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};
