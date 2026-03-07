import pool from "../config/db.js";

export const createSystemService = async ({ systems, link }) => {
    if (!systems) {
        const err = new Error("systems is required");
        err.statusCode = 400;
        throw err;
    }

    systems = systems.trim().toUpperCase();

    const result = await pool.query(
        `
        INSERT INTO systems (systems, link)
        VALUES ($1, $2)
        RETURNING *
        `,
        [systems, link ?? null]
    );

    return result.rows[0];
};

export const getSystemsService = async () => {
    const result = await pool.query(
        "SELECT * FROM systems ORDER BY id ASC"
    );
    return result.rows;
};

export const getSystemByIdService = async (id) => {
    const result = await pool.query(
        "SELECT * FROM systems WHERE id = $1",
        [id]
    );

    if (result.rowCount === 0) {
        const err = new Error("System not found");
        err.statusCode = 404;
        throw err;
    }

    return result.rows[0];
};

export const updateSystemService = async (id, { systems, link }) => {
    if (!systems && link === undefined) {
        const err = new Error("At least one field is required to update");
        err.statusCode = 400;
        throw err;
    }

    if (systems) {
        systems = systems.trim().toUpperCase();
    }

    const result = await pool.query(
        `
        UPDATE systems
        SET
            systems = COALESCE($1, systems),
            link = COALESCE($2, link)
        WHERE id = $3
        RETURNING *
        `,
        [systems ?? null, link ?? null, id]
    );

    if (result.rowCount === 0) {
        const err = new Error("System not found");
        err.statusCode = 404;
        throw err;
    }

    return result.rows[0];
};

export const deleteSystemService = async (id) => {
    const result = await pool.query(
        "DELETE FROM systems WHERE id = $1 RETURNING *",
        [id]
    );

    if (result.rowCount === 0) {
        const err = new Error("System not found");
        err.statusCode = 404;
        throw err;
    }

    return true;
};
