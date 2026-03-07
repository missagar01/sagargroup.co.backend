require('dotenv').config();
const pool = require('./src/config/db');

async function checkTable() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leave_request'");
        if (res.rows.length === 0) {
            console.log('No such table');
        } else {
            console.log('---COLUMNS---');
            res.rows.forEach(r => console.log(r.column_name));
            console.log('---END---');
        }
        process.exit(0);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

checkTable();
