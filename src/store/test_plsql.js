import { getConnection } from './src/config/db.js';
import oracledb from 'oracledb';

async function main() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT text FROM all_source WHERE name = 'LHS_UTILITY' ORDER BY line`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 5000 }
    );
    const lines = result.rows.map(r => r.TEXT);
    const targetCodes = ['user_code', 'emp_code', 'div_code', 'dept_code', 'cost_code', 'acc_code'];
    
    for (const code of targetCodes) {
      console.log(`\n=================== SEARCHING FOR: ${code} ===================`);
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(`'${code}'`)) {
          found = true;
          console.log(`Match at line ${i+1}:`);
          for (let j = Math.max(0, i - 1); j < Math.min(lines.length, i + 8); j++) {
            console.log(`  ${j+1}: ${lines[j].trim()}`);
          }
        }
      }
      if (!found) {
        console.log(`No exact match for '${code}' found in package source.`);
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
