const { pgQuery } = require('./config/pg.js');
const dotenv = require('dotenv');
dotenv.config();

async function checkSchema() {
    try {
        const clientsSchema = await pgQuery("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clients'");
        console.log("--- Clients Table ---");
        clientsSchema.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
