import { getPgPool } from "../config/postgres.js";

const pool = getPgPool();

export const getUsersService = async () => {
    const result = await pool.query(`
    SELECT *
    FROM users
    WHERE user_name IS NOT NULL
    ORDER BY id ASC
  `);

    return result.rows;
};

export const patchStoreAccessService = async (id, store_access) => {
    if (!store_access || store_access.trim() === "") {
        const result = await pool.query(
            `
      UPDATE users
      SET store_access = NULL
      WHERE id = $1
      RETURNING *
      `,
            [id]
        );
        return result.rows[0];
    }

    const uniqueAccess = [
        ...new Set(
            store_access
                .split(",")
                .map(v => v.trim().toUpperCase())
                .filter(Boolean)
        ),
    ];

    const result = await pool.query(
        `
    UPDATE users
    SET store_access = $1
    WHERE id = $2
    RETURNING *
    `,
        [uniqueAccess.join(","), id]
    );

    return result.rows[0];
};

