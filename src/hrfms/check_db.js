require('dotenv').config();
const pool = require('./src/config/db');

async function checkTable() {
    try {
        const res = await pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'leave_request')");
        const exists = res.rows[0].exists;
        const result = { exists };
        if (exists) {
            const columns = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leave_request'");
            result.columns = columns.rows;
        }
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

checkTable();



