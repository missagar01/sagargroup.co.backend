const { pgQuery } = require("../../../config/pg.js");

/**
 * Get all size master data from PostgreSQL database
 * @returns {Promise<Array>} Array of size master records
 */
async function getSizeMasterData() {
    try {
        const query = `SELECT * FROM size_master ORDER BY id`;
        const result = await pgQuery(query);
        return result.rows;
    } catch (err) {
        console.error("Error fetching size master data:", err);
        throw err;
    }
}



/**
 * Get size master data by ID
 * @param {number} id - The size master ID
 * @returns {Promise<Object>} Size master record
 */
async function getSizeMasterById(id) {
    try {
        const query = `SELECT * FROM size_master WHERE id = $1`;
        const result = await pgQuery(query, [id]);
        return result.rows[0] || null;
    } catch (err) {
        console.error("Error fetching size master by ID:", err);
        throw err;
    }
}

/**
 * Create a new enquiry (or multiple enquiries) in the database
 * @param {Object|Array} enquiryData - The enquiry data or array of enquiry data
 * @returns {Promise<Object|Array>} Created enquiry record(s)
 */
async function createEnquiry(enquiryData) {
    try {
        if (Array.isArray(enquiryData)) {
            const results = [];
            for (const item of enquiryData) {
                const { item_type, size, thickness, enquiry_date, customer, quantity, sales_executive } = item;
                const query = `
                    INSERT INTO enq_erp (item_type, size, thickness, enquiry_date, customer, quantity, sales_executive)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `;
                const values = [
                    item_type,
                    size,
                    parseFloat(thickness),
                    enquiry_date,
                    customer,
                    quantity ? parseFloat(quantity) : null,
                    sales_executive || null
                ];
                const result = await pgQuery(query, values);
                results.push(result.rows[0]);
            }
            return results;
        } else {
            const { item_type, size, thickness, enquiry_date, customer, quantity, sales_executive } = enquiryData;
            const query = `
                INSERT INTO enq_erp (item_type, size, thickness, enquiry_date, customer, quantity, sales_executive)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            const values = [
                item_type,
                size,
                parseFloat(thickness),
                enquiry_date,
                customer,
                quantity ? parseFloat(quantity) : null,
                sales_executive || null
            ];
            const result = await pgQuery(query, values);
            return result.rows[0];
        }
    } catch (err) {
        console.error("Error creating enquiry:", err);
        throw err;
    }
}

/**
 * Get enquiry report from PostgreSQL database, optionally filtered by month
 * @param {string} [month] - Optional month in YYYY-MM format
 * @returns {Promise<Array>} Array of enquiry report records
 */
async function getCurrentMonthEnquiryReport(month) {
    try {
        let query;
        let values = [];

        if (month && month !== "All Months") {
            query = `
                SELECT item_type, size, thickness, sales_executive, SUM(quantity) as total
                FROM enq_erp
                WHERE TO_CHAR(enquiry_date, 'YYYY-MM') = $1
                GROUP BY item_type, size, thickness, sales_executive
            `;
            values = [month];
        } else if (month === "All Months") {
            // Show overall data if "All Months" is explicitly selected
            query = `
                SELECT item_type, size, thickness, sales_executive, SUM(quantity) as total
                FROM enq_erp
                GROUP BY item_type, size, thickness, sales_executive
            `;
        } else {
            // Default to current month if no specific month is requested
            query = `
                SELECT item_type, size, thickness, sales_executive, SUM(quantity) as total
                FROM enq_erp
                WHERE DATE_TRUNC('month', enquiry_date) = DATE_TRUNC('month', CURRENT_DATE)
                GROUP BY item_type, size, thickness, sales_executive
            `;
        }

        const result = await pgQuery(query, values);
        return result.rows;
    } catch (err) {
        console.error("Error fetching enquiry report:", err);
        throw err;
    }
}

/**
 * Get all enquiries from the database
 * @param {string} [salesExecutive] - Optional sales executive filter for regular users
 * @returns {Promise<Array>} Array of all enquiry records
 */
async function getAllEnquiries(salesExecutive = null) {
    try {
        let query = `
            SELECT 
                id,
                item_type,
                size,
                thickness,
                enquiry_date,
                customer,
                quantity,
                sales_executive,
                created_at
            FROM enq_erp
        `;

        const values = [];

        // If salesExecutive is provided, filter by it (for regular users)
        if (salesExecutive) {
            query += ` WHERE sales_executive = $1`;
            values.push(salesExecutive);
        }

        query += ` ORDER BY enquiry_date DESC, id DESC`;

        const result = await pgQuery(query, values);
        return result.rows;
    } catch (err) {
        console.error("Error fetching all enquiries:", err);
        throw err;
    }
}

module.exports = {
    getSizeMasterData,
    getSizeMasterById,
    createEnquiry,
    getCurrentMonthEnquiryReport,
    getAllEnquiries
};
