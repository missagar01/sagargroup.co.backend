const { pgQuery } = require('./config/pg.js');
const dotenv = require('dotenv');
dotenv.config();

async function speedTest() {
    try {
        console.log("🚀 Starting Speed Test...");

        const startClients = Date.now();
        await pgQuery(`
            SELECT 
                c.client_id, c.client_name, c.city, c.contact_person, 
                c.contact_details, c.sales_person_id, c.client_type, c.status,
                u.user_name as sales_person 
            FROM clients c 
            LEFT JOIN users u ON c.sales_person_id = u.id 
            ORDER BY c.created_at ASC
        `);
        console.log(`⏱️ getClients took: ${Date.now() - startClients}ms`);

        const startFollowups = Date.now();
        await pgQuery(`
            SELECT 
                followup_id, client_name, sales_person, 
                actual_order, actual_order_date, date_of_calling, next_calling_date 
            FROM client_followups 
            ORDER BY date_of_calling ASC 
            LIMIT 500
        `);
        console.log(`⏱️ getAllFollowups took: ${Date.now() - startFollowups}ms`);

        process.exit(0);
    } catch (err) {
        console.error("❌ Speed test failed:", err);
        process.exit(1);
    }
}

speedTest();
