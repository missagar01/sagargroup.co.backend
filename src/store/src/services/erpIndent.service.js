// src/services/erpIndent.service.js
import { getConnection } from "../config/db.js";
import oracledb from "oracledb";

/**
 * Fetches ERP indents from Oracle for a specific user.
 * @param {string} employeeId - The logged-in user's employee_id (mapped to emp_code in Oracle).
 * @returns {Promise<Array>}
 */
export async function getUserErpIndents(employeeId) {
  const conn = await getConnection();
  try {
    const sql = `
      SELECT * FROM (
        SELECT  t.vrno AS indent_no,
                t.vrdate AS indent_date,
                (select a.passport_no from emp_mast a where a.emp_code = (select b.createdby from indent_head b where b.vrno = t.vrno )) as employee_id,
                upper(lhs_utility.get_name('emp_code',(select b.createdby from indent_head b where b.vrno = t.vrno ))) as indenter,
                lhs_utility.get_name('div_code',  t.div_code)  AS division,
                upper(lhs_utility.get_name('dept_code', t.dept_code)) AS department,
                t.item_code,
                t.item_name,
                t.qtyindent,
                t.um,
                t.acknowledgedate,
                lhs_utility.get_name('user_code', t.acknowledgeby) AS purchaser,

                -- PO numbers (comma separated)
                ( SELECT LISTAGG(a.vrno, ', ') WITHIN GROUP (ORDER BY a.vrno)
                  FROM view_order_engine a
                  WHERE a.indent_vrno = t.vrno
                    AND a.item_code   = t.item_code
                ) AS po_number,

                -- GRN numbers (comma separated)
                ( SELECT LISTAGG(b.vrno, ', ') WITHIN GROUP (ORDER BY b.vrno)
                  FROM view_itemtran_engine b
                  WHERE b.indent_vrno = t.vrno
                    AND b.item_code   = t.item_code
                ) AS grn_no,

                -- GRN dates (comma separated)
                ( SELECT LISTAGG(TO_CHAR(b.vrdate, 'DD-MON-YYYY'), ', ')
                         WITHIN GROUP (ORDER BY b.vrdate)
                  FROM view_itemtran_engine b
                  WHERE b.indent_vrno = t.vrno
                    AND b.item_code   = t.item_code
                ) AS grn_date,

                -- Issue numbers (comma separated)
                ( SELECT LISTAGG(b.vrno, ', ') WITHIN GROUP (ORDER BY b.vrno)
                  FROM view_itemtran_engine b
                  WHERE b.indent_vrno1 = t.vrno
                    AND b.item_code   = t.item_code
                    AND b.tcode = 'Q'
                ) AS issue_no,

                -- Issue dates (comma separated)
                ( SELECT LISTAGG(TO_CHAR(b.vrdate, 'DD-MON-YYYY'), ', ')
                         WITHIN GROUP (ORDER BY b.vrdate)
                  FROM view_itemtran_engine b
                  WHERE b.indent_vrno1 = t.vrno
                    AND b.item_code   = t.item_code
                    AND b.tcode = 'Q'
                ) AS issue_date,

                -- Receiver (comma separated)
                ( SELECT LISTAGG(b.irfield1, ', ') WITHIN GROUP (ORDER BY b.irfield1)
                  FROM view_itemtran_engine b
                  WHERE b.indent_vrno1 = t.vrno
                    AND b.item_code   = t.item_code
                    AND b.tcode = 'Q'
                ) AS receiver

        FROM view_indent_engine t
        WHERE t.entity_code = 'SR'
              and trunc(t.vrdate,'MM') = trunc(sysdate, 'MM')
      ) WHERE employee_id = :employeeId
      ORDER BY indent_date ASC, indent_no ASC
    `;

    console.log(`[erpIndent.service.js] Executing SQL for employeeId: ${employeeId}`);
    const result = await conn.execute(sql, [employeeId], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    console.log(`[erpIndent.service.js] Oracle returned ${result.rows?.length || 0} rows`);
    if (result.rows && result.rows.length > 0) {
      console.log(`[erpIndent.service.js] Sample row:`, JSON.stringify(result.rows[0]));
    }

    return result.rows || [];
  } catch (err) {
    console.error("getUserErpIndents error:", err);
    throw err;
  } finally {
    await conn.close();
  }
}
