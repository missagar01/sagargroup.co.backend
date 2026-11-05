const { getConnection } = require("../config/db.js");
const oracledb = require("oracledb");
const { pgQuery } = require("../../../config/pg.js");

// "pending" is only the implicit default for invoices with no saved status — it is
// never a value the API accepts to write, so it's excluded here.
const PAYMENT_STATUSES = ["advance", "half", "full"];

const invoiceQuery = `
SELECT DISTINCT t.vrno,
       TO_CHAR(t.vrdate,'dd-mm-yyyy') AS fidate,
       lhs_utility.get_name('acc_code', t.acc_code) AS partyname,
       t.truckno,
       CASE
           WHEN t.div_code = 'PM' THEN 'MS PIPE'
           WHEN t.div_code = 'SM' THEN 'MS BILLET'
           WHEN t.div_code = 'RP' THEN 'PATRA'
           ELSE ''
       END AS itemname
FROM view_itemtran_engine t
WHERE t.entity_code = 'SR'
  AND t.series = 'SA'
  AND t.div_code = 'PM'
  AND t.waybillno IS NOT NULL
  AND t.vrdate >= :fromDate
GROUP BY t.vrno, t.vrdate, lhs_utility.get_name('acc_code', t.acc_code), t.truckno, t.div_code, t.acc_code, t.um
ORDER BY t.vrno ASC
`;

async function getOracleInvoices(fromDate) {
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      invoiceQuery,
      { fromDate },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows;
  } finally {
    if (connection) await connection.close();
  }
}

// invoice_date comes back from Oracle as 'dd-mm-yyyy'; planned payment date is invoice date + 7 days.
function addDaysToDDMMYYYY(dateStr, days) {
  if (!dateStr) return null;
  const [dd, mm, yyyy] = dateStr.split("-").map(Number);
  if (!dd || !mm || !yyyy) return null;

  const date = new Date(yyyy, mm - 1, dd);
  date.setDate(date.getDate() + days);

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

async function getStatusMap(vrnos) {
  if (!vrnos.length) return {};
  const result = await pgQuery(
    "SELECT * FROM invoice_payment_followup WHERE vrno = ANY($1::text[])",
    [vrnos]
  );
  const map = {};
  for (const row of result.rows) map[row.vrno] = row;
  return map;
}

async function getInvoicePaymentFollowup(fromDate) {
  const invoices = await getOracleInvoices(fromDate);
  const vrnos = invoices.map((row) => String(row.VRNO));
  const statusMap = await getStatusMap(vrnos);

  return invoices.map((row) => {
    const vrno = String(row.VRNO);
    const status = statusMap[vrno];
    return {
      vrno,
      invoice_date: row.FIDATE,
      planned_date: addDaysToDDMMYYYY(row.FIDATE, 7),
      party_name: row.PARTYNAME,
      truck_no: row.TRUCKNO,
      item_name: row.ITEMNAME,
      payment_status: status?.payment_status || "pending",
      remarks: status?.remarks || "",
      updated_by: status?.updated_by || null,
      updated_at: status?.updated_at || null,
    };
  });
}

async function upsertPaymentStatus({ vrno, payment_status, remarks, updated_by }) {
  if (!PAYMENT_STATUSES.includes(payment_status)) {
    const err = new Error(`Invalid payment_status "${payment_status}"`);
    err.statusCode = 400;
    throw err;
  }

  const query = `
    INSERT INTO invoice_payment_followup (vrno, payment_status, remarks, updated_by, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (vrno) DO UPDATE SET
      payment_status = EXCLUDED.payment_status,
      remarks = EXCLUDED.remarks,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING *
  `;
  const result = await pgQuery(query, [
    vrno,
    payment_status,
    remarks ?? null,
    updated_by ?? null,
  ]);
  return result.rows[0];
}

async function bulkUpsertPaymentStatus({ vrnos, payment_status, remarks, updated_by }) {
  if (!PAYMENT_STATUSES.includes(payment_status)) {
    const err = new Error(`Invalid payment_status "${payment_status}"`);
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(vrnos) || !vrnos.length) {
    const err = new Error("vrnos must be a non-empty array");
    err.statusCode = 400;
    throw err;
  }

  const query = `
    INSERT INTO invoice_payment_followup (vrno, payment_status, remarks, updated_by, updated_at)
    SELECT unnest($1::text[]), $2, $3, $4, NOW()
    ON CONFLICT (vrno) DO UPDATE SET
      payment_status = EXCLUDED.payment_status,
      remarks = EXCLUDED.remarks,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING *
  `;
  const result = await pgQuery(query, [
    vrnos,
    payment_status,
    remarks ?? null,
    updated_by ?? null,
  ]);
  return result.rows;
}

module.exports = {
  PAYMENT_STATUSES,
  getInvoicePaymentFollowup,
  upsertPaymentStatus,
  bulkUpsertPaymentStatus,
};


