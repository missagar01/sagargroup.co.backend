import { getConnection } from './src/config/db.js';
import oracledb from 'oracledb';

async function test() {
  const conn = await getConnection();
  try {
    const products = await conn.execute(
      "SELECT count(*) as count FROM item_mast WHERE item_nature = 'SI'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Total Products (item_nature=SI):', products.rows[0].COUNT || products.rows[0].count);

    const vendors = await conn.execute(
      "SELECT count(*) as count FROM acc_mast WHERE acc_type = 'C'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Total Vendors (acc_type=C):', vendors.rows[0].COUNT || vendors.rows[0].count);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

test();
