const { pgQuery } = require('./config/pg.js');
const dotenv = require('dotenv');
dotenv.config();

async function addIndexes() {
    try {
        console.log("Checking and adding indexes...");

        // Clients indexes
        await pgQuery(`CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at ASC)`);
        await pgQuery(`CREATE INDEX IF NOT EXISTS idx_clients_sales_person_id ON clients(sales_person_id)`);

        // Followups indexes
        await pgQuery(`CREATE INDEX IF NOT EXISTS idx_followups_date_of_calling ON client_followups(date_of_calling ASC)`);

        console.log("✅ Indexes added successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to add indexes:", err);
        process.exit(1);
    }
}

addIndexes();
