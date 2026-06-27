import oracledb from "../config/oracleClient.js";
import { getConnection } from "../config/db.js";

/**
 * Format Date as 'DD-MON-RR' for Oracle
 */
function formatOracleDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}



/**
 * Search items in ITEM_MAST
 */
export async function searchItems(query) {
  let connection;
  try {
    connection = await getConnection();
    const sql = `
      SELECT ITEM_CODE as "itemCode", ITEM_NAME as "itemName", UM as "um"
      FROM ITEM_MAST
      WHERE (UPPER(ITEM_CODE) LIKE UPPER(:query) OR UPPER(ITEM_NAME) LIKE UPPER(:query))
        AND ROWNUM <= 25
    `;
    const result = await connection.execute(sql, { query: `%${query}%` }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows || [];
  } finally {
    if (connection) await connection.close();
  }
}

/**
 * Get item stock using LHS_UTILITY date context and VIEW_ITEM_STOCK_ENGINE
 */
export async function getItemStock(itemCode) {
  let connection;
  try {
    connection = await getConnection();

    // 1. Calculate current financial year start (April 1st)
    const now = new Date();
    let currentYear = now.getFullYear();
    if (now.getMonth() < 3) { // Jan, Feb, Mar -> previous year start
      currentYear -= 1;
    }
    const fromDate = `01-APR-${String(currentYear).slice(-2)}`;
    const toDate = formatOracleDate(now);

    console.log(`[chatbotService] Checking stock for ${itemCode} in date range: ${fromDate} to ${toDate}`);

    // 2. Set the date window in the package
    const plsql = `
      BEGIN
        LHS_UTILITY.SET_FROM_DATE( TO_DATE(:p_from, 'DD-MON-RR') );
        LHS_UTILITY.SET_TO_DATE( TO_DATE(:p_to,  'DD-MON-RR') );
      END;
    `;
    await connection.execute(plsql, {
      p_from: fromDate,
      p_to: toDate
    });

    // 3. Query stock
    const sql = `
      SELECT SUM(NVL(YRCLQTY_ENGINE, 0)) AS "stock"
      FROM VIEW_ITEM_STOCK_ENGINE
      WHERE ITEM_CODE = :itemCode
        AND ENTITY_CODE = 'SR'
        AND (
            div_code IN ('C1','C2','CO','F1','F2','F3','PM','R1','R2','RM','RP','SM')
            OR div_code IS NULL
        )
    `;
    const result = await connection.execute(sql, { itemCode }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const stockVal = result.rows && result.rows.length > 0 ? (result.rows[0].stock || 0) : 0;
    return stockVal;
  } finally {
    if (connection) await connection.close();
  }
}

/**
 * Get available indent series/types from config_mast
 */
export async function getIndentSeries() {
  let connection;
  try {
    connection = await getConnection();
    const sql = `
      SELECT DISTINCT SERIES as "series", BHEADING as "descr", ENTITY_CODE as "entityCode", DIV_CODE as "divCode"
      FROM config_mast
      WHERE TCODE = 'I'
        AND ENTITY_CODE = 'SR'
        AND SERIES IN ('I1', 'I3', 'I4', 'I5')
      ORDER BY SERIES
    `;
    const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows || [];
  } finally {
    if (connection) await connection.close();
  }
}

/**
 * Get standard distinct departments with full names
 */
export async function getDepartments() {
  let connection;
  try {
    connection = await getConnection();
    const sql = `
      SELECT DISTINCT DEPT_CODE as "deptCode", NVL(DEPT_NAME, DEPT_CODE) as "deptName"
      FROM DEPT_MAST
      WHERE DEPT_CODE IS NOT NULL
      ORDER BY DEPT_CODE
    `;
    const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows || [];
  } finally {
    if (connection) await connection.close();
  }
}

/**
 * Get available cost codes from COST_MAST
 */
export async function getCostCodes() {
  let connection;
  try {
    connection = await getConnection();
    const sql = `
      SELECT COST_CODE as "costCode", COST_NAME as "costName"
      FROM COST_MAST
      WHERE COST_CODE IS NOT NULL
      ORDER BY COST_CODE
    `;
    const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows || [];
  } finally {
    if (connection) await connection.close();
  }
}

/**
 * Get available employees from EMP_MAST
 */
export async function getEmployees() {
  let connection;
  try {
    connection = await getConnection();
    const sql = `
      SELECT EMP_CODE as "empCode", TRIM(EMP_NAME) as "empName"
      FROM EMP_MAST
      WHERE EMP_CODE IS NOT NULL AND EMP_NAME IS NOT NULL
      ORDER BY EMP_NAME
    `;
    const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows || [];
  } finally {
    if (connection) await connection.close();
  }
}

/**
 * Get available makes from MAKE_MAST
 */
export async function getMakes() {
  let connection;
  try {
    connection = await getConnection();
    const sql = `
      SELECT MAKE_CODE as "makeCode", TRIM(MAKE_NAME) as "makeName"
      FROM MAKE_MAST
      WHERE MAKE_CODE IS NOT NULL AND MAKE_NAME IS NOT NULL
      ORDER BY MAKE_NAME
    `;
    const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows || [];
  } finally {
    if (connection) await connection.close();
  }
}

/**
 * Create a new indent in database (Atomic Transaction)
 */
export async function createIndent({ items, itemCode, qty, deptCode, series, specs, purpose, dueDate, userCode, make = null, costCode = 'CC001', empName = '', divCode = null }) {
  let connection;
  try {
    connection = await getConnection();
    const finalUserCode = 'SR00113';

    // Construct final list of items to support multiple item indents
    let finalItems = items;
    if (!Array.isArray(finalItems) || finalItems.length === 0) {
      finalItems = [{ itemCode, qty, make, specs, purpose }];
    }

    // 2. Fetch series configuration to get exact entity and division
    const seriesSql = `
      SELECT ENTITY_CODE as "entityCode", DIV_CODE as "divCode" 
      FROM config_mast 
      WHERE SERIES = :series AND TCODE = 'I' AND ROWNUM = 1
    `;
    const seriesResult = await connection.execute(seriesSql, { series }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    if (!seriesResult.rows || seriesResult.rows.length === 0) {
      throw new Error(`Series ${series} is not configured for Indents (TCODE 'I').`);
    }
    const entityCode = seriesResult.rows[0]?.entityCode || 'SR';
    let finalDivCode = divCode;
    if (!finalDivCode || finalDivCode.trim() === '') {
      finalDivCode = seriesResult.rows[0]?.divCode;
      if (!finalDivCode || finalDivCode.trim() === '') {
        if (entityCode === 'AL') {
          finalDivCode = 'C2';
        } else if (entityCode === 'PA') {
          finalDivCode = 'C1';
        } else {
          finalDivCode = 'CO';
        }
      }
    }

    // 3. Generate Next VRNO from sequence
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const yearSuffix = `${yy}Y-`;
    const prefix = `I${series}${yearSuffix}`;

    const seqSql = `
      SELECT :series || :yy || 'Y-' || 
             LPAD(
                  NVL((
                      SELECT TO_NUMBER(t.lastvrno)
                      FROM vrseq_mast t
                      WHERE t.vrprefix = :prefix
                        AND t.entity_code = :entityCode
                  ),0) + 1,
             5,
             '0') AS "new_vrno"
      FROM dual
    `;

    const seqResult = await connection.execute(seqSql, { series, yy, prefix, entityCode }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const newVrNo = seqResult.rows[0].new_vrno;
    console.log(`[chatbotService] Generated VRNO: ${newVrNo} for series: ${series}, prefix: ${prefix}, entity: ${entityCode}`);

    // Update sequence table
    const updateResult = await connection.execute(`
      UPDATE vrseq_mast 
      SET lastvrno = TO_CHAR(TO_NUMBER(NVL(lastvrno, '0')) + 1)
      WHERE vrprefix = :prefix AND entity_code = :entityCode
    `, { prefix, entityCode }, { autoCommit: false });

    if (updateResult.rowsAffected === 0) {
      console.log(`[chatbotService] Initializing sequence row for prefix ${prefix} and entity ${entityCode}`);
      await connection.execute(`
        INSERT INTO vrseq_mast (ENTITY_CODE, VRPREFIX, LASTVRNO)
        VALUES (:entityCode, :prefix, '1')
      `, { entityCode, prefix }, { autoCommit: false });
    }

    // 4. Fetch unique transaction sequence IDs
    const headSeqResult = await connection.execute(`SELECT LHSSYS_L2_TRAN_SEQ.NEXTVAL as "seq" FROM dual`);
    const headTranSeq = headSeqResult.rows[0][0];

    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Date without time
    const parsedDueDate = dueDate ? new Date(dueDate) : currentDate;

    // 5. Insert into INDENT_HEAD
    const indentRemark = empName ? `Created via Chatbot - ${empName}` : 'Created via Chatbot';
    const headInsert = `
      INSERT INTO INDENT_HEAD (
        ENTITY_CODE, TCODE, VRNO, VRDATE, DEPT_CODE, INDENT_REMARK, AUTOINDENT_FLAG, USER_CODE, LASTUPDATE, CURRENCY_CODE, EXCHANGE_RATE, CREATEDBY, CREATEDDATE, HEAD_TRAN_SEQ
      ) VALUES (
        :entityCode, 'I', :newVrNo, :currentDate, :deptCode, :indentRemark, 'N', :userCode, :now, 'INR', 1, :userCode, :now, :headTranSeq
      )
    `;
    await connection.execute(headInsert, {
      entityCode,
      newVrNo,
      currentDate,
      deptCode,
      indentRemark,
      userCode: finalUserCode,
      now,
      headTranSeq
    }, { autoCommit: false });

    // 6. Insert items into INDENT_BODY
    let slno = 1;
    for (const item of finalItems) {
      // Fetch item UM from ITEM_MAST for each item
      const itemSql = `SELECT UM as "um" FROM ITEM_MAST WHERE ITEM_CODE = :itemCode`;
      const itemResult = await connection.execute(itemSql, { itemCode: item.itemCode }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if (!itemResult.rows || itemResult.rows.length === 0) {
        throw new Error(`Item code ${item.itemCode} not found in ITEM_MAST.`);
      }
      const um = itemResult.rows[0].um || 'NOS';

      const bodySeqResult = await connection.execute(`SELECT LHSSYS_L2_TRAN_SEQ.NEXTVAL as "seq" FROM dual`);
      const bodyTranSeq = bodySeqResult.rows[0][0];

      const bodyInsert = `
        INSERT INTO INDENT_BODY (
          ENTITY_CODE, TCODE, VRNO, SLNO, VRDATE, DIV_CODE, ITEM_CODE, UM, QTYINDENT, AUM, AQTYINDENT, RATE, REMARK, PURPOSE_REMARK, DUEDATE, PRIORITY_INDEX, COST_CODE, MAKE_CODE, AUMTOUM, QTYREQ, STOCK_TYPE, FC_RATE, TRAN_SEQ
        ) VALUES (
          :entityCode, 'I', :newVrNo, :slno, :currentDate, :divCode, :itemCode, :um, :qty, :um, :qty, 1, :specs, :purpose, :parsedDueDate, 'U', :costCode, :make, 1, :qty, 'R', 1, :bodyTranSeq
        )
      `;
      await connection.execute(bodyInsert, {
        entityCode,
        newVrNo,
        slno,
        currentDate,
        divCode: finalDivCode,
        itemCode: item.itemCode,
        um,
        qty: Number(item.qty),
        specs: item.specs || '',
        purpose: item.purpose || '',
        parsedDueDate,
        costCode,
        make: item.make || null,
        bodyTranSeq
      }, { autoCommit: false });

      slno++;
    }

    // Commit Transaction
    await connection.commit();
    console.log(`[chatbotService] Successfully saved indent header and body for ${newVrNo} with ${finalItems.length} items`);

    return {
      success: true,
      vrNo: newVrNo,
      deptCode,
      entityCode,
      divCode: finalDivCode
    };

  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
        console.log('[chatbotService] Transaction rolled back due to error.');
      } catch (rollErr) {
        console.error('[chatbotService] Rollback error:', rollErr.message);
      }
    }
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}
