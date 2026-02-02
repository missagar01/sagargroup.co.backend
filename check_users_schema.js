const { loginQuery } = require('./config/pg.js');
const dotenv = require('dotenv');
dotenv.config();

async function checkUsersSchema() {
    try {
        const usersSchema = await loginQuery("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'");
        console.log("--- Users Table ---");
        usersSchema.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUsersSchema();
