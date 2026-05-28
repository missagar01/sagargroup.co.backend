import { getConnection } from './src/config/db.js';
import oracledb from 'oracledb';

async function test() {
  const conn = await getConnection();
  try {
    console.log('--- Testing Indents Count ---');
    const indentsTotal = await conn.execute(
      "SELECT count(*) as count FROM view_indent_engine t WHERE t.entity_code = 'SR'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Total Indents (SR only):', indentsTotal.rows[0].COUNT || indentsTotal.rows[0].count);

    const indentsDate = await conn.execute(
      "SELECT count(*) as count FROM view_indent_engine t WHERE t.entity_code = 'SR' AND t.vrdate >= DATE '2025-04-01'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Total Indents >= 2025-04-01:', indentsDate.rows[0].COUNT || indentsDate.rows[0].count);

    const maxVrDateIndent = await conn.execute(
      "SELECT MAX(t.vrdate) as max_date FROM view_indent_engine t WHERE t.entity_code = 'SR'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Latest Indent Date (SR):', maxVrDateIndent.rows[0].MAX_DATE || maxVrDateIndent.rows[0].max_date);

    console.log('\n--- Testing Purchase Orders Count ---');
    const poTotal = await conn.execute(
      "SELECT count(*) as count FROM view_order_engine t WHERE t.entity_code = 'SR' AND t.series = 'U3'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Total PO (SR, U3):', poTotal.rows[0].COUNT || poTotal.rows[0].count);

    const poDate = await conn.execute(
      "SELECT count(*) as count FROM view_order_engine t WHERE t.entity_code = 'SR' AND t.series = 'U3' AND t.vrdate >= DATE '2025-04-01'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Total PO >= 2025-04-01:', poDate.rows[0].COUNT || poDate.rows[0].count);

    const maxVrDatePo = await conn.execute(
      "SELECT MAX(t.vrdate) as max_date FROM view_order_engine t WHERE t.entity_code = 'SR' AND t.series = 'U3'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Latest PO Date (SR, U3):', maxVrDatePo.rows[0].MAX_DATE || maxVrDatePo.rows[0].max_date);

    console.log('\n--- Testing Sample Indent Record ---');
    const sampleIndent = await conn.execute(
      "SELECT t.vrno, t.vrdate, t.entity_code, t.po_no, t.cancelleddate FROM view_indent_engine t WHERE t.entity_code = 'SR' AND rownum <= 3",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Sample indents:', sampleIndent.rows);

  } catch (err) {
    console.error('Error during query diagnostics:', err);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

test();
