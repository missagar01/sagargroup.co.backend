const { pgQuery, getPgPool } = require("../../../config/pg.js");
const { generateCacheKey, withCache, delCached, delCachedPattern, DEFAULT_TTL } = require("../utils/cacheHelper.js");

// ==========================================
// CLIENTS CRUD
// ==========================================

const CLIENTS_CACHE_KEY = generateCacheKey("clients");
const MARKETING_USERS_CACHE_KEY = generateCacheKey("marketing_users");

function isUserAdmin(user) {
    if (!user) return false;
    const role = (user.role || "").toString().toLowerCase();
    const userType = (user.userType || "").toString().toLowerCase();
    const username = (user.user_name || user.username || "").toString().trim().toLowerCase();
    return (
        role === "admin" ||
        role === "all access" ||
        role.includes("all access") ||
        userType === "admin" ||
        userType === "all access" ||
        username === "admin"
    );
}

/**
 * Get all clients
 */

// Local (server-timezone) date string, matching Postgres CURRENT_DATE, so the
// cached clients list - which carries a date-sensitive followed_up_today flag -
// naturally rolls over at midnight instead of going stale for a TTL window.
function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function getClients(options = {}, user = null) {
    const {
        excludeFollowedToday = false,
        fresh = false,
        search = ""
    } = options;

    const isAdmin = isUserAdmin(user);
    const userScope = isAdmin ? "admin_all" : `user_${user?.id || user?.username || "all"}`;

    const cacheKey = generateCacheKey("clients", {
        excludeFollowedToday: excludeFollowedToday ? 1 : 0,
        day: todayKey(),
        scope: userScope,
        search: String(search || "").trim().toLowerCase()
    });

    const fetchClients = async () => {
        try {
            const conditions = [];
            const values = [];

            const normalizedSearch = String(search || "").trim();
            if (normalizedSearch) {
                values.push(`%${normalizedSearch.toLowerCase()}%`);
                const p = `$${values.length}`;
                conditions.push(`(
                    LOWER(COALESCE(t.client_name, '')) LIKE ${p} OR
                    LOWER(COALESCE(t.contact_person, '')) LIKE ${p} OR
                    LOWER(COALESCE(t.contact_details, '')) LIKE ${p} OR
                    LOWER(COALESCE(t.city, '')) LIKE ${p} OR
                    LOWER(COALESCE(t1.user_name, '')) LIKE ${p}
                )`);
            }

            if (!isAdmin && user) {
                const userId = Number.parseInt(user.id, 10);
                const userName = (user.user_name || user.username || "").trim();

                if (Number.isInteger(userId) && userId > 0 && userName) {
                    values.push(userId);
                    const p1 = `$${values.length}`;
                    values.push(userName);
                    const p2 = `$${values.length}`;
                    conditions.push(`(t.sales_person_id = ${p1} OR LOWER(TRIM(COALESCE(t1.user_name, ''))) = LOWER(TRIM(${p2})))`);
                } else if (Number.isInteger(userId) && userId > 0) {
                    values.push(userId);
                    conditions.push(`t.sales_person_id = $${values.length}`);
                } else if (userName) {
                    values.push(userName);
                    conditions.push(`LOWER(TRIM(COALESCE(t1.user_name, ''))) = LOWER(TRIM($${values.length}))`);
                }
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(" AND ")}`
                : "";
            const limitClause = normalizedSearch ? "LIMIT 500" : "";

            const query = `
                SELECT
                    t.client_id,
                    t.client_name,
                    t.city,
                    t.contact_person,
                    t.contact_details,
                    t.sales_person_id,
                    t.client_type,
                    t.status,
                    t.created_at,
                    t1.user_name as sales_person
                FROM clients t
                LEFT JOIN users t1 ON t.sales_person_id = t1.id
                ${whereClause}
                ORDER BY LOWER(TRIM(COALESCE(t.client_name, ''))) ASC, t.client_id ASC
                ${limitClause}
            `;

            const result = await pgQuery(query, values);
            const clientRows = result.rows;
            const clientNames = Array.from(new Set(
                clientRows
                    .map((row) => String(row.client_name || "").trim().toLowerCase())
                    .filter(Boolean)
            ));

            if (clientNames.length === 0) {
                return [];
            }

            const followedResult = await pgQuery(
                `SELECT DISTINCT LOWER(TRIM(client_name)) AS client_name
                 FROM client_followups
                 WHERE date_of_calling >= CURRENT_DATE
                   AND date_of_calling < CURRENT_DATE + INTERVAL '1 day'
                   AND LOWER(TRIM(client_name)) = ANY($1::text[])`,
                [clientNames]
            );
            const followedNames = new Set(followedResult.rows.map((row) => row.client_name));
            const withFollowupStatus = clientRows.map((row) => ({
                ...row,
                followed_up_today: followedNames.has(String(row.client_name || "").trim().toLowerCase())
            }));

            return excludeFollowedToday
                ? withFollowupStatus.filter((row) => !row.followed_up_today)
                : withFollowupStatus;
        } catch (err) {
            console.error("Error fetching clients:", err);
            throw err;
        }
    };

    if (fresh) {
        return fetchClients();
    }

    return withCache(cacheKey, DEFAULT_TTL.CUSTOMERS, fetchClients);
}

/**
 * Get client by ID
 */
async function getClientById(clientId, user = null) {
    try {
        const isAdmin = isUserAdmin(user);
        let query = `
            SELECT t.client_id, t.client_name, t.city, t.contact_person, t.contact_details, t.sales_person_id, t.client_type, t.status, t1.user_name as sales_person
            FROM clients t
            LEFT JOIN users t1 ON t.sales_person_id = t1.id
            WHERE t.client_id = $1
        `;
        const values = [clientId];

        if (!isAdmin && user) {
            const userId = Number.parseInt(user.id, 10);
            const userName = (user.user_name || user.username || "").trim();
            if (Number.isInteger(userId) && userId > 0 && userName) {
                values.push(userId);
                const p1 = `$${values.length}`;
                values.push(userName);
                const p2 = `$${values.length}`;
                query += ` AND (t.sales_person_id = ${p1} OR LOWER(TRIM(COALESCE(t1.user_name, ''))) = LOWER(TRIM(${p2})))`;
            } else if (Number.isInteger(userId) && userId > 0) {
                values.push(userId);
                query += ` AND t.sales_person_id = $${values.length}`;
            } else if (userName) {
                values.push(userName);
                query += ` AND LOWER(TRIM(COALESCE(t1.user_name, ''))) = LOWER(TRIM($${values.length}))`;
            }
        }

        const result = await pgQuery(query, values);
        return result.rows[0] || null;
    } catch (err) {
        console.error("Error fetching client by ID:", err);
        throw err;
    }
}

/**
 * Invalidate clients cache
 */
async function invalidateClientsCache() {
    const day = todayKey();
    await delCachedPattern("o2d:clients*");
    await delCached(CLIENTS_CACHE_KEY);
    await delCached(generateCacheKey("clients", { excludeFollowedToday: 0 }));
    await delCached(generateCacheKey("clients", { excludeFollowedToday: 1 }));
    await delCached(generateCacheKey("clients", { excludeFollowedToday: 0, day }));
    await delCached(generateCacheKey("clients", { excludeFollowedToday: 1, day }));
    await delCached(generateCacheKey("clients_count"));
}

async function resolveNextClientId(dbClient, providedClientId) {
    const parsedClientId = Number.parseInt(providedClientId, 10);
    if (Number.isInteger(parsedClientId) && parsedClientId > 0) {
        return parsedClientId;
    }

    const sequenceResult = await dbClient.query(
        `SELECT pg_get_serial_sequence('clients', 'client_id') AS sequence_name`
    );
    const sequenceName = sequenceResult.rows[0]?.sequence_name;

    if (sequenceName) {
        const nextIdResult = await dbClient.query(
            `SELECT nextval($1::regclass) AS client_id`,
            [sequenceName]
        );
        return nextIdResult.rows[0].client_id;
    }

    // Legacy databases may not have a sequence/default on clients.client_id.
    // Lock writes while we derive the next integer to avoid duplicate ids.
    await dbClient.query(`LOCK TABLE clients IN EXCLUSIVE MODE`);

    const nextIdResult = await dbClient.query(
        `SELECT COALESCE(MAX(client_id), 0) + 1 AS client_id FROM clients`
    );
    return nextIdResult.rows[0].client_id;
}

/**
 * Create a new client
 */
async function createClient(clientData, user = null) {
    const dbClient = await getPgPool().connect();
    try {
        const isAdmin = isUserAdmin(user);
        const {
            client_id,
            client_name,
            city,
            contact_person,
            contact_details,
            client_type,
            status
        } = clientData;

        let salesPersonId = clientData.sales_person_id ? parseInt(clientData.sales_person_id) : null;
        if (!isAdmin && user) {
            const parsedUserId = Number.parseInt(user.id, 10);
            if (Number.isInteger(parsedUserId) && parsedUserId > 0) {
                salesPersonId = parsedUserId;
            }
        }

        await dbClient.query("BEGIN");

        const nextClientId = await resolveNextClientId(dbClient, client_id);

        const query = `
            INSERT INTO clients (
                client_id, client_name, city, contact_person, 
                contact_details, sales_person_id, client_type, status,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
        `;

        const values = [
            nextClientId,
            client_name,
            city || null,
            contact_person || null,
            contact_details || null,
            salesPersonId,
            client_type || null,
            status || 'Active'
        ];

        const result = await dbClient.query(query, values);
        await dbClient.query("COMMIT");

        // Invalidate cache
        await invalidateClientsCache();

        return result.rows[0];
    } catch (err) {
        try {
            await dbClient.query("ROLLBACK");
        } catch (rollbackErr) {
            console.error("Error rolling back client creation:", rollbackErr);
        }
        console.error("Error creating client:", err);
        throw err;
    } finally {
        dbClient.release();
    }
}

/**
 * Update a client
 */
async function updateClient(clientId, clientData, user = null) {
    try {
        const isAdmin = isUserAdmin(user);
        if (!isAdmin && user) {
            const existing = await getClientById(clientId, user);
            if (!existing) {
                const err = new Error("Permission denied: You can only update your own clients.");
                err.statusCode = 403;
                throw err;
            }
        }

        const {
            client_name,
            city,
            contact_person,
            contact_details,
            client_type,
            status
        } = clientData;

        let salesPersonId = clientData.sales_person_id ? parseInt(clientData.sales_person_id) : null;
        if (!isAdmin && user) {
            const parsedUserId = Number.parseInt(user.id, 10);
            if (Number.isInteger(parsedUserId) && parsedUserId > 0) {
                salesPersonId = parsedUserId;
            }
        }

        const query = `
            UPDATE clients 
            SET client_name = $1, 
                city = $2, 
                contact_person = $3, 
                contact_details = $4, 
                sales_person_id = $5, 
                client_type = $6, 
                status = $7,
                updated_at = CURRENT_TIMESTAMP
            WHERE client_id = $8
            RETURNING *
        `;

        const values = [
            client_name,
            city,
            contact_person,
            contact_details,
            salesPersonId,
            client_type,
            status,
            clientId
        ];

        const result = await pgQuery(query, values);

        // Invalidate cache
        await invalidateClientsCache();

        return result.rows[0];
    } catch (err) {
        console.error("Error updating client:", err);
        throw err;
    }
}

/**
 * Delete a client
 */
async function deleteClient(clientId, user = null) {
    try {
        const isAdmin = isUserAdmin(user);
        if (!isAdmin && user) {
            const existing = await getClientById(clientId, user);
            if (!existing) {
                const err = new Error("Permission denied: You can only delete your own clients.");
                err.statusCode = 403;
                throw err;
            }
        }

        const query = `DELETE FROM clients WHERE client_id = $1 RETURNING *`;
        const result = await pgQuery(query, [clientId]);

        // Invalidate cache
        await invalidateClientsCache();

        return result.rows[0];
    } catch (err) {
        console.error("Error deleting client:", err);
        throw err;
    }
}

/**
 * Get users from MARKETING department
 */
async function getMarketingUsers() {
    try {
        const query = `SELECT id, user_name, department FROM users WHERE department = 'MARKETING' ORDER BY user_name ASC`;
        const result = await pgQuery(query);
        return result.rows;
    } catch (err) {
        console.error("Error fetching marketing users:", err);
        throw err;
    }
}

/**
 * Get total count of clients
 */
async function getTotalClientsCount(user = null) {
    const isAdmin = isUserAdmin(user);
    const userScope = isAdmin ? "admin_all" : `user_${user?.id || user?.username || "all"}`;

    return withCache(generateCacheKey("clients_count", { scope: userScope }), DEFAULT_TTL.CUSTOMERS, async () => {
        try {
            let query = `
                SELECT COUNT(*)::int as total
                FROM clients t
                LEFT JOIN users t1 ON t.sales_person_id = t1.id
            `;
            const values = [];

            if (!isAdmin && user) {
                const userId = Number.parseInt(user.id, 10);
                const userName = (user.user_name || user.username || "").trim();

                if (Number.isInteger(userId) && userId > 0 && userName) {
                    query += ` WHERE (t.sales_person_id = $1 OR LOWER(TRIM(COALESCE(t1.user_name, ''))) = LOWER(TRIM($2)))`;
                    values.push(userId, userName);
                } else if (Number.isInteger(userId) && userId > 0) {
                    query += ` WHERE t.sales_person_id = $1`;
                    values.push(userId);
                } else if (userName) {
                    query += ` WHERE LOWER(TRIM(COALESCE(t1.user_name, ''))) = LOWER(TRIM($1))`;
                    values.push(userName);
                }
            }

            const result = await pgQuery(query, values);
            return result.rows[0].total;
        } catch (err) {
            console.error("Error fetching clients count:", err);
            throw err;
        }
    });
}

module.exports = {
    getClients,
    getClientById,
    createClient,
    updateClient,
    deleteClient,
    getMarketingUsers,
    getTotalClientsCount,
    invalidateClientsCache,
    isUserAdmin
};

