const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

const client = new Client({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

const fs = require('fs');

async function checkSchema() {
    let output = '';
    try {
        await client.connect();
        output += `Connected to database: ${process.env.DB_NAME}\n`;

        const tables = ['fms_leads', 'leads_tracker', 'enquiry_tracker'];

        for (const table of tables) {
            output += `\nChecking table: ${table}\n`;
            const res = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);

            if (res.rows.length === 0) {
                output += `Table ${table} does not exist.\n`;
            } else {
                output += `Columns in ${table}:\n`;
                output += res.rows.map(r => `${r.column_name} (${r.data_type})`).join('\n') + '\n';
            }
        }

        fs.writeFileSync('schema_dump.txt', output);
        console.log('Schema dump written to schema_dump.txt');

    } catch (err) {
        console.error('Error:', err);
        fs.writeFileSync('schema_dump.txt', `Error: ${err.message}`);
    } finally {
        await client.end();
    }
}

checkSchema();
