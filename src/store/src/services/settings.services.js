import { getPgPool } from "../config/postgres.js";
import { getOrSetCache, deleteCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";

const pool = getPgPool();

export const getUsersService = async () => {
    return getOrSetCache(
        cacheKeys.settingsUsers(),
        async () => {
            const result = await pool.query(`
              SELECT *
              FROM users
              WHERE user_name IS NOT NULL
              ORDER BY id ASC
            `);

            return result.rows;
        },
        DEFAULT_TTL.SETTINGS
    );
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
        await deleteCache(cacheKeys.settingsUsers());
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

    await deleteCache(cacheKeys.settingsUsers());
    return result.rows[0];
};

