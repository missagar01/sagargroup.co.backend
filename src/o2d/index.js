const express = require("express");
const oracledb = require("oracledb");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config({ quiet: true });

const app = express();
app.use(express.json());
app.use(cors());

oracledb.initOracleClient({ libDir: "C:/oracle/instantclient_23_9" });

let pool;

// Initialize Oracle connection pool
async function initPool() {
  try {
    pool = await oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECTION_STRING,
      poolMin: 1,
      poolMax: 10,
      poolIncrement: 1,
      connectTimeout: 10,   // fail if DB not reachable in 10s
      queueTimeout: 10000,  // fail if waiting >10s
      stmtCacheSize: 0
    });
    console.log("✅ Oracle connection pool started");
  } catch (err) {
    console.error("❌ Pool init failed:", err);
    process.exit(1);
  }
}

// =======================
// Fetch all students
app.get("/users", async (req, res) => {
  console.log("Fetching all students...");
  let conn;
  try {
    conn = await pool.getConnection();

    // ✅ 1. Check schema exists
    const schemaCheck = await conn.execute(
      `SELECT username FROM all_users WHERE username = :schemaName`,
      { schemaName: 'SRMPLERP' },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (schemaCheck.rows.length === 0) {
      return res.status(404).json({ error: "Schema SRMPLERP does not exist" });
    }

    console.log("Schema SRMPLERP exists ✅");

    // ✅ 2. Check table exists
    const tableCheck = await conn.execute(
      `SELECT table_name 
         FROM all_tables 
        WHERE owner = :schemaName 
          AND table_name = :tableName`,
      { schemaName: 'SRMPLERP', tableName: 'ACCBAL_AUDIT' },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (tableCheck.rows.length === 0) {
      return res.status(404).json({ error: "Table ACCBAL_AUDIT does not exist in schema SRMPLERP" });
    }

    console.log("Table ACCBAL_AUDIT exists ✅");

    // ✅ 3. Fetch data
    const result = await conn.execute(
      `SELECT * FROM SRMPLERP.ACCBAL_AUDIT`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log("Rows fetched:", result.rows.length);
    res.json(result.rows);

  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});


// Route to list all schemas and tables
app.get("/schema", async (req, res) => {
  console.log("Fetching all schemas and tables...");
  let conn;
  try {
    conn = await pool.getConnection();

    // 1️⃣ Get all schemas
    const schemasResult = await conn.execute(
      `SELECT username AS schema_name FROM all_users ORDER BY username`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const schemas = schemasResult.rows.map(r => r.SCHEMA_NAME);
    console.log("Schemas found:", schemas.length);

    // 2️⃣ Optional: Get tables for each schema (you can limit to a few for performance)
    const schemaTables = {};

    for (let schema of schemas) {
      const tablesResult = await conn.execute(
        `SELECT table_name FROM all_tables WHERE owner = :schema ORDER BY table_name`,
        { schema },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      schemaTables[schema] = tablesResult.rows.map(r => r.TABLE_NAME);
    }

    res.json({
      totalSchemas: schemas.length,
      schemas: schemaTables
    });

  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

app.get("/current-schema", async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.execute(
      `SELECT sys_context('USERENV','CURRENT_SCHEMA') AS schema_name FROM dual`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});



app.post("/store-indent", async (req, res) => {
  let conn;
  try {
    const {
      timestamp,
      indenterName,
      department,
      groupHead,
      itemCode,
      productName,
      quantity,
      uom,
      specifications,
      indentApprovedBy,
      indentType,
      attachment,
    } = req.body;

    conn = await pool.getConnection();

    // 1️⃣ Fetch the last indent number
    const result = await conn.execute(
      `SELECT MAX(TO_NUMBER(REGEXP_SUBSTR(INDENT_NUMBER, '[0-9]+'))) AS LAST_NUM FROM STORE_INDENT`
    );

    const lastNum = result.rows[0][0] || 0;
    const newNum = lastNum + 1;
    const indentNumber = `SI-${String(newNum).padStart(4, '0')}`;

    // 2️⃣ Insert with new indent number
    await conn.execute(
      `INSERT INTO STORE_INDENT 
       (TIMESTAMP, INDENT_NUMBER, INDENTER_NAME, DEPARTMENT, GROUP_HEAD, 
        ITEM_CODE, PRODUCT_NAME, QUANTITY, UOM, SPECIFICATIONS, 
        INDENT_APPROVED_BY, INDENT_TYPE, ATTACHMENT)
       VALUES (
         TO_TIMESTAMP(:timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),
         :indentNumber,
         :indenterName,
         :department,
         :groupHead,
         :itemCode,
         :productName,
         :quantity,
         :uom,
         :specifications,
         :indentApprovedBy,
         :indentType,
         :attachment
       )`,
      {
        timestamp,
        indentNumber,
        indenterName,
        department,
        groupHead,
        itemCode,
        productName,
        quantity,
        uom,
        specifications,
        indentApprovedBy,
        indentType,
        attachment,
      },
      { autoCommit: true }
    );

    res.json({ success: true, message: "Indent saved successfully", indentNumber });
  } catch (err) {
    console.error("Error inserting indent:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});


app.put("/store-indent/approve", async (req, res) => {
  let conn;
  try {
    const { indentNumber, itemCode, vendorType, approvedQuantity } = req.body;

    conn = await pool.getConnection();
    const result = await conn.execute(
      `UPDATE STORE_INDENT
          SET VENDOR_TYPE = :vendorType,
              APPROVED_QUANTITY = :approvedQuantity,
              ACTUAL_1 = SYSDATE
        WHERE INDENT_NUMBER = :indentNumber
          AND ITEM_CODE = :itemCode`,
      { indentNumber, itemCode, vendorType, approvedQuantity },
      { autoCommit: true }
    );

    res.json({ success: true, message: "Indent approved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});


app.get("/store-indent/pending", async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.execute(
      `SELECT * FROM STORE_INDENT 
        WHERE PLANNED_1 IS NOT NULL 
          AND ACTUAL_1 IS NULL`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});


app.get("/store-indent/history", async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.execute(
      `SELECT * FROM STORE_INDENT 
        WHERE PLANNED_1 IS NOT NULL 
          AND ACTUAL_1 IS NOT NULL`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});



app.get("/tables", async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.execute(
      `SELECT table_name 
         FROM all_tables 
        WHERE owner = :owner
        ORDER BY table_name`,
      ["SRMPLERP"],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});


// Start server
const port = 3000;
app.listen(port, async () => {
  await initPool();
  console.log(`🚀 Server running at http://localhost:${port}`);
});
