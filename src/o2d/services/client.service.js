const { pgQuery, getPgPool } = require("../../../config/pg.js");
const { generateCacheKey, withCache, delCached, DEFAULT_TTL } = require("../utils/cacheHelper.js");

// ==========================================
// CLIENTS CRUD
// ==========================================

const CLIENTS_CACHE_KEY = generateCacheKey("clients");
const MARKETING_USERS_CACHE_KEY = generateCacheKey("marketing_users");

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

async function getClients(options = {}) {
    const {
        excludeFollowedToday = false,
        fresh = false
    } = options;

    const cacheKey = generateCacheKey("clients", {
        excludeFollowedToday: excludeFollowedToday ? 1 : 0,
        day: todayKey()
    });

    const fetchClients = async () => {
        try {
            // Clients that already have a follow-up logged for today. Used to
            // flag each row (followed_up_today) and, optionally, to exclude them.
            // Never filters newly created clients out - a brand new client has
            // no follow-up, so it always shows.
            const followupFilter = excludeFollowedToday
                ? "WHERE ft.client_name IS NULL"
                : "";

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
                    t1.user_name as sales_person,
                    (ft.client_name IS NOT NULL) AS followed_up_today
                FROM clients t
                LEFT JOIN users t1 ON t.sales_person_id = t1.id
                LEFT JOIN (
                    SELECT DISTINCT LOWER(TRIM(cf.client_name)) AS client_name
                    FROM client_followups cf
                    WHERE cf.date_of_calling::date = CURRENT_DATE
                ) ft ON ft.client_name = LOWER(TRIM(t.client_name))
                ${followupFilter}
                ORDER BY LOWER(TRIM(COALESCE(t.client_name, ''))) ASC, t.client_id ASC
            `;

            const result = await pgQuery(query);
            return result.rows;
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
async function getClientById(clientId) {
    try {
        const query = `SELECT client_id, client_name, city, contact_person, contact_details, sales_person_id, client_type, status FROM clients WHERE client_id = $1`;
        const result = await pgQuery(query, [clientId]);
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
async function createClient(clientData) {
    const dbClient = await getPgPool().connect();
    try {
        const {
            client_id,
            client_name,
            city,
            contact_person,
            contact_details,
            sales_person_id,
            client_type,
            status
        } = clientData;

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
            sales_person_id ? parseInt(sales_person_id) : null,
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
async function updateClient(clientId, clientData) {
    try {
        const {
            client_name,
            city,
            contact_person,
            contact_details,
            sales_person_id,
            client_type,
            status
        } = clientData;

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
            sales_person_id ? parseInt(sales_person_id) : null,
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
async function deleteClient(clientId) {
    try {
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
async function getTotalClientsCount() {
    return withCache(generateCacheKey("clients_count"), DEFAULT_TTL.CUSTOMERS, async () => {
        try {
            const query = `SELECT COUNT(*)::int as total FROM clients`;
            const result = await pgQuery(query);
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
    invalidateClientsCache
};

