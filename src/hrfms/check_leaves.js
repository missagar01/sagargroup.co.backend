require('dotenv').config();
const pool = require('./src/config/db');

async function check() {
    try {
        const res = await pool.query("SELECT id, employee_name, from_date, to_date, commercial_head_status FROM leave_request ORDER BY created_at DESC LIMIT 5");
        // Show raw and stringified dates
        console.table(res.rows.map(r => ({
            id: r.id,
            name: r.employee_name,
            from_raw: r.from_date,
            to_raw: r.to_date,
            s_from: String(r.from_date),
            s_to: String(r.to_date)
        })));
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

check();
