import pool from "../config/db.js";

export const createPersonService = async (personToMeet, phone) => {
    try {
        const { rows } = await pool.query(
            `INSERT INTO person_to_meet (person_to_meet, phone)
             VALUES ($1,$2) RETURNING *`,
            [personToMeet, phone]
        );

        return rows[0];
    } catch (err) {
        err.message = "Failed to create person";
        throw err;
    }
};

export const getAllPersonsService = async () => {
    try {
        const { rows } = await pool.query(
            `SELECT id, person_to_meet, phone
             FROM person_to_meet
             ORDER BY person_to_meet`
        );

        return rows;
    } catch (err) {
        err.message = "Failed to fetch persons";
        throw err;
    }
};

export const updatePersonService = async (id, personToMeet, phone) => {
    try {
        const { rowCount } = await pool.query(
            `UPDATE person_to_meet
             SET person_to_meet = $1,
                 phone = $2
             WHERE id = $3`,
            [personToMeet, phone, id]
        );

        if (!rowCount) {
            const error = new Error("Person not found");
            error.statusCode = 404;
            throw error;
        }
    } catch (err) {
        if (!err.statusCode) {
            err.message = "Failed to update person";
        }
        throw err;
    }
};

export const deletePersonService = async (id) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM person_to_meet WHERE id = $1`,
            [id]
        );

        if (!rowCount) {
            const error = new Error("Person not found");
            error.statusCode = 404;
            throw error;
        }
    } catch (err) {
        if (!err.statusCode) {
            err.message = "Failed to delete person";
        }
        throw err;
    }
};
