const { Client } = require('pg');

const config = {
  host: 'database-2-mumbai.c1wm8i46kcmm.ap-south-1.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: 'Sagar00112233',
  database: 'checklist-delegation',
  ssl: { rejectUnauthorized: false },
};

async function main() {
  const client = new Client(config);
  try {
    await client.connect();
    console.log('Connected to RDS DB');

    const res = await client.query(`
      SELECT 
        id, 
        topic, 
        message_timestamp, 
        device_uid, 
        meter_timestamp, 
        created_at
      FROM mqtt_messages 
      WHERE id BETWEEN 110 AND 120
      ORDER BY id ASC
    `);

    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
