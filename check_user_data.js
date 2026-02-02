const { loginQuery } = require('./config/pg.js');
const dotenv = require('dotenv');
dotenv.config();

async function checkUserData() {
    try {
        const result = await loginQuery("SELECT user_name, user_access, page_access, system_access FROM users WHERE user_name LIKE '%Sheetal%'");
        console.log("--- User Data ---");
        console.log(JSON.stringify(result.rows, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUserData();
