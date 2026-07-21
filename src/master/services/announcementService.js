import pool from "../config/db.js";

/*
 * start_date/end_date are stored as `timestamp without time zone` (plain
 * wall-clock, no timezone math). They are always read back via to_char()
 * as a fixed "YYYY-MM-DDTHH:MI:SS" string instead of letting the pg driver
 * turn them into JS Date objects — that conversion silently re-interprets
 * the naive value using the server process's local timezone and corrupts
 * the time the user actually entered.
 */
const COLUMNS = `
    id,
    title,
    message,
    to_char(start_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_date,
    to_char(end_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS end_date,
    is_active,
    priority,
    created_by,
    created_at
`;

const createAnnouncement = async (data) => {
    const {
        title,
        message,
        start_date,
        end_date,
        is_active = true,
        priority = 1,
        created_by,
    } = data;

    const result = await pool.query(
        `
        INSERT INTO announcements
            (title, message, start_date, end_date, is_active, priority, created_by)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7)
        RETURNING ${COLUMNS}
        `,
        [title, message, start_date, end_date, is_active, priority, created_by]
    );
    return result.rows[0];
};

const getAllAnnouncements = async () => {
    const result = await pool.query(
        `
        SELECT ${COLUMNS}
        FROM announcements
        WHERE is_active = TRUE
          AND start_date <= CURRENT_TIMESTAMP
          AND end_date >= CURRENT_TIMESTAMP
        ORDER BY priority DESC, id DESC
        `
    );
    return result.rows;
};

const getAllAnnouncementsAdmin = async () => {
    const result = await pool.query(
        `
        SELECT ${COLUMNS}
        FROM announcements
        ORDER BY priority DESC, id DESC
        `
    );
    return result.rows;
};

const getAnnouncementById = async (id) => {
    const result = await pool.query(
        `SELECT ${COLUMNS} FROM announcements WHERE id = $1`,
        [id]
    );
    return result.rows[0];
};

const updateAnnouncement = async (id, data) => {
    const {
        title,
        message,
        start_date,
        end_date,
        is_active,
        priority,
    } = data;

    const result = await pool.query(
        `
        UPDATE announcements
        SET title = COALESCE($1, title),
            message = COALESCE($2, message),
            start_date = COALESCE($3, start_date),
            end_date = COALESCE($4, end_date),
            is_active = COALESCE($5, is_active),
            priority = COALESCE($6, priority)
        WHERE id = $7
        RETURNING ${COLUMNS}
        `,
        [title, message, start_date, end_date, is_active, priority, id]
    );
    return result.rows[0];
};

const deleteAnnouncement = async (id) => {
    const result = await pool.query(
        `DELETE FROM announcements WHERE id = $1 RETURNING id`,
        [id]
    );
    return result.rows[0];
};

export default {
    createAnnouncement,
    getAllAnnouncements,
    getAllAnnouncementsAdmin,
    getAnnouncementById,
    updateAnnouncement,
    deleteAnnouncement,
};
