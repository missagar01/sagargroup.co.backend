const { pgQuery } = require("../../../config/pg.js");
const {
  STAGE_ORDER,
  plannedCol,
  actualCol,
  nextStage,
  computeEnquiryStatus,
} = require("../utils/enquiryPipeline.js");

const REQUIRED_FIELDS = [
  "name",
  "company_name",
  "mobile",
  "email",
  "requirement",
  "sales_person",
];

const ENQ_NO_PREFIX = "ENQ-";

function isAdminRole(role) {
  const userRole = (role || "").toString().toLowerCase();
  return userRole === "admin" || userRole === "all access";
}

function isOwner(row, username) {
  return (
    (row.sales_person || "").toString().trim().toLowerCase() ===
    (username || "").toString().trim().toLowerCase()
  );
}

async function createEnquiry(data) {
  const values = REQUIRED_FIELDS.map((field) => data[field] ?? null);

  // enq_no is auto-generated as ENQ-0001, ENQ-0002, ... from the highest existing number.
  // Computed in the same statement as the insert to keep the read-then-write race window minimal.
  const query = `
    WITH next_no AS (
      SELECT $7::text || LPAD(
        (COALESCE(MAX(SUBSTRING(enq_no FROM ($7::text || '(\\d+)'))::int), 0) + 1)::text,
        4, '0'
      ) AS enq_no
      FROM enquiry
      WHERE enq_no LIKE $7::text || '%'
    )
    INSERT INTO enquiry (
      enq_no, name, company_name, mobile, email, requirement, sales_person,
      created_at, fm_planned
    )
    SELECT next_no.enq_no, $1, $2, $3, $4, $5, $6, NOW(), NOW() + INTERVAL '24 hours'
    FROM next_no
    RETURNING *
  `;

  const result = await pgQuery(query, [...values, ENQ_NO_PREFIX]);
  return computeEnquiryStatus(result.rows[0]);
}

async function getAllEnquiries(username, role) {
  const isAdmin = isAdminRole(role);

  let query = "SELECT * FROM enquiry";
  const params = [];

  if (!isAdmin) {
    query += " WHERE LOWER(TRIM(sales_person)) = LOWER(TRIM($1))";
    params.push(username || "");
  }

  query += " ORDER BY created_at DESC";

  const result = await pgQuery(query, params);
  return result.rows.map(computeEnquiryStatus);
}

async function getEnquiryById(id, username, role) {
  const result = await pgQuery("SELECT * FROM enquiry WHERE id = $1", [id]);
  const row = result.rows[0];
  if (!row) return null;

  if (!isAdminRole(role) && !isOwner(row, username)) {
    const err = new Error("You do not have access to this enquiry");
    err.statusCode = 403;
    throw err;
  }

  return computeEnquiryStatus(row);
}

async function markStageComplete(id, stage, username, role) {
  if (!STAGE_ORDER.includes(stage)) {
    const err = new Error(`Invalid stage "${stage}"`);
    err.statusCode = 400;
    throw err;
  }

  const existing = await pgQuery("SELECT * FROM enquiry WHERE id = $1", [id]);
  const row = existing.rows[0];
  if (!row) return null;

  if (!isAdminRole(role) && !isOwner(row, username)) {
    const err = new Error("You do not have access to this enquiry");
    err.statusCode = 403;
    throw err;
  }

  if (row[actualCol(stage)]) {
    const err = new Error(`Stage "${stage}" is already completed`);
    err.statusCode = 400;
    throw err;
  }

  if (!row[plannedCol(stage)]) {
    const err = new Error(`Cannot complete "${stage}" before its previous stage is completed`);
    err.statusCode = 400;
    throw err;
  }

  const next = nextStage(stage);
  const query = next
    ? `UPDATE enquiry
         SET ${actualCol(stage)} = NOW(),
             ${plannedCol(next)} = NOW() + INTERVAL '24 hours'
       WHERE id = $1
       RETURNING *`
    : `UPDATE enquiry
         SET ${actualCol(stage)} = NOW()
       WHERE id = $1
       RETURNING *`;

  const result = await pgQuery(query, [id]);
  return computeEnquiryStatus(result.rows[0]);
}

module.exports = {
  createEnquiry,
  getAllEnquiries,
  getEnquiryById,
  markStageComplete,
};
