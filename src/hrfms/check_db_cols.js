require('dotenv').config();
const pool = require('./src/config/db');

async function checkTable() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'leave_request'");
        console.log(res.rows.map(r => r.column_name).join(', '));
        process.exit(0);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

checkTable();
