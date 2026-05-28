import { getConnection } from './src/store/src/config/db.js';
import oracledb from 'oracledb';

async function main() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT text FROM all_source WHERE name = 'LHS_UTILITY' ORDER BY line`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 5000 }
    );
    console.log("LHS_UTILITY Source Lines:", result.rows.length);
    let printLine = false;
    for (const row of result.rows) {
      const line = row.TEXT;
      if (line.toUpperCase().includes('FUNCTION GET_NAME')) {
        printLine = true;
      }
      if (printLine) {
        console.log(line.replace(/\n$/, ''));
        if (line.toUpperCase().includes('END GET_NAME') || line.toUpperCase().includes('END;')) {
          printLine = false;
        }
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
main();
