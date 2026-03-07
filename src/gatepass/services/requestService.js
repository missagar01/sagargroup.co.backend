import pool from "../config/db.js";
import axios from "axios";

export const createVisitRequestService = async (
    payload,
    visitorPhoto
) => {
    try {
        const {
            visitorName,
            mobileNumber,
            visitorAddress,
            purposeOfVisit,
            personToMeet,
            dateOfVisit,
            timeOfEntry
        } = payload;

        const insertQuery = `
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

        const insertResult = await pool.query(insertQuery, [
            visitorName,
            mobileNumber,
            visitorPhoto,
            visitorAddress || null,
            purposeOfVisit || null,
            personToMeet,
            dateOfVisit,
            timeOfEntry
        ]);

        const visitorId = insertResult.rows[0].id;

        const personQuery = `
            SELECT person_to_meet, phone
            FROM person_to_meet
            WHERE LOWER(TRIM(person_to_meet)) = LOWER(TRIM($1))
            LIMIT 1
        `;

        const personResult = await pool.query(personQuery, [personToMeet]);
        const person = personResult.rows[0];

        return { visitorId, person };
    } catch (err) {
        err.message = "Failed to create visit request";
        throw err;
    }
};

export const sendVisitRequestWhatsapp = async (
    person,
    visitorDetails
) => {
    if (!person || !person.phone) {
        console.warn("WhatsApp skipped: person or phone not found");
        return;
    }

    let cleanPhone = person.phone.replace(/\D/g, "");

    if (!cleanPhone.startsWith("91")) {
        cleanPhone = "91" + cleanPhone;
    }

    const {
        visitorName,
        mobileNumber,
        visitorAddress,
        purposeOfVisit,
        dateOfVisit,
        timeOfEntry
    } = visitorDetails;

    const message = `
*Visitor Name:* ${visitorName}
📱 *Visitor Mobile:* ${mobileNumber}
🎯 *Purpose:* ${purposeOfVisit || "N/A"}
📅 *Date of Visit:* ${dateOfVisit}
⏰ *Time of Entry:* ${timeOfEntry}
🏠 *Visitor Address:* ${visitorAddress || "N/A"}
👤 *Meeting With:* ${person.person_to_meet}

*Login for Approve:*
🔗 https://gate-pass-srmpl.vercel.app/dashboard/quick-task
    `;

    try {
        await axios.post(
            `${process.env.MAYTAPI_BASE_URL}/${process.env.MAYTAPI_PRODUCT_ID}/${process.env.MAYTAPI_PHONE_ID}/sendMessage`,
            {
                to_number: cleanPhone,
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
        console.error(
            "⚠️ WhatsApp send failed:",
            err.response?.data || err.message
        );
    }
};

export const sendVisitRequestWhatsappToGroup = async (
    person,
    visitorDetails
) => {
    if (!process.env.VISITOR_GROUP_ID) {
        console.warn("WhatsApp group skipped: VISITOR_GROUP_ID not found");
        return;
    }

    const {
        visitorName,
        mobileNumber,
        purposeOfVisit,
        dateOfVisit,
        timeOfEntry,
        visitorAddress
    } = visitorDetails;

    // 👉 SAME message, JUST WITHOUT LOGIN LINK
    const message = `
*New Visitor Request Created*

*Visitor Name:* ${visitorName}
📱 *Visitor Mobile:* ${mobileNumber}
🎯 *Purpose:* ${purposeOfVisit || "N/A"}
📅 *Date of Visit:* ${dateOfVisit}
⏰ *Time of Entry:* ${timeOfEntry}
🏠 *Visitor Address:* ${visitorAddress || "N/A"}
👤 *Meeting With:* ${person?.person_to_meet || "N/A"}
    `;

    try {
        await axios.post(
            `${process.env.MAYTAPI_BASE_URL}/${process.env.MAYTAPI_PRODUCT_ID}/${process.env.MAYTAPI_PHONE_ID}/sendMessage`,
            {
                to_number: process.env.VISITOR_GROUP_ID, // 👈 GROUP ID
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
        console.error(
            "⚠️ WhatsApp group send failed:",
            err.response?.data || err.message
        );
    }
};


export const getAllVisitsForAdminService = async () => {
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
        return rows;
    } catch (err) {
        err.message = "Failed to fetch visit list";
        throw err;
    }
};


export const getVisitorByMobileService = async (mobileNumber) => {
    try {
        const query = `
            SELECT
                visitor_name     AS "visitorName",
                mobile_number    AS "mobileNumber",
                visitor_address  AS "visitorAddress",
                purpose_of_visit AS "purposeOfVisit",
                person_to_meet   AS "personToMeet"
            FROM visitors
            WHERE mobile_number = $1
            ORDER BY created_at DESC
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [mobileNumber]);

        if (rows.length === 0) {
            return null;
        }

        return rows[0];
    } catch (err) {
        err.message = "Failed to fetch visitor by mobile number";
        throw err;
    }
};
