import {
  createIndent,
  updateIndentStatus,
  updateIndentStatusBulk,
  fetchIndents,
  fetchIndentByRequestNumber,
  updateIndentNumberService,
} from "../services/indent.service.js";

function pickStatusCode(err, notFoundStatus = 404) {
  if (!err?.message) return 500;
  if (err.message.toLowerCase().includes("not found")) return notFoundStatus;
  if (
    err.message.toLowerCase().includes("invalid") ||
    err.message.toLowerCase().includes("required") ||
    err.message.toLowerCase().includes("no valid fields")
  ) {
    return 400;
  }
  return 500;
}

export async function submitIndent(req, res) {
  try {
    const payload = {
      ...req.body,
      group_name: req.body.group_name ?? req.body.groupName ?? null,
    };
    const record = await createIndent(payload);
    return res.status(201).json({
      success: true,
      data: record,
    });
  } catch (err) {
    console.error("submitIndent error:", err);
    const status = pickStatusCode(err, 400);
    return res.status(status).json({
      success: false,
      error: err.message || "Failed to create indent",
    });
  }
}

export async function updateIndentDecision(req, res) {
  const requestNumber = req.params.requestNumber;
  try {
    const body = req.body;
    let updatesPayload = body;
    if (body && typeof body === "object" && !Array.isArray(body) && Array.isArray(body.items)) {
      updatesPayload = body.items;
    }

    const isArrayPayload = Array.isArray(updatesPayload);
    const record = isArrayPayload
      ? await updateIndentStatusBulk(requestNumber, updatesPayload)
      : await updateIndentStatus(requestNumber, updatesPayload);
    return res.json({
      success: true,
      total: Array.isArray(record) ? record.length : undefined,
      data: record,
    });
  } catch (err) {
    console.error("updateIndentDecision error:", err);
    const status = pickStatusCode(err, 404);
    return res.status(status).json({
      success: false,
      error: err.message || "Failed to update indent",
    });
  }
}

export async function listIndents(req, res) {
  try {
    const statusParam = req.query.status;
    const hasStatusParam = typeof statusParam === "string" && statusParam.trim().length > 0;
    const queryOptions = { ...req.query };
    if (!hasStatusParam) {
      queryOptions.statuses = ["PENDING"];
    }
    const { rows, pagination } = await fetchIndents(queryOptions);
    return res.json({
      success: true,
      total: rows.length,
      data: rows,
      pagination,
    });
  } catch (err) {
    console.error("listIndents error:", err);
    const status = pickStatusCode(err, 400);
    return res.status(status).json({
      success: false,
      error: err.message || "Failed to fetch indents",
    });
  }
}

export async function listAllIndents(req, res) {
  try {
    // Fetch all indents from PostgreSQL (AWS RDS)
    const { rows } = await fetchIndents({});

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("listAllIndents error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch indents",
    });
  }
}

export async function filterIndents(req, res) {
  try {
    const { rows, pagination } = await fetchIndents({ ...req.query });
    return res.json({
      success: true,
      total: rows.length,
      data: rows,
      pagination,
    });
  } catch (err) {
    console.error("filterIndents error:", err);
    const status = pickStatusCode(err, 400);
    return res.status(status).json({
      success: false,
      error: err.message || "Failed to filter indents",
    });
  }
}

export async function getIndent(req, res) {
  const requestNumber = req.params.requestNumber;
  try {
    const record = await fetchIndentByRequestNumber(requestNumber);
    if (!record || record.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Indent with request_number ${requestNumber} not found`,
      });
    }
    return res.json({
      success: true,
      total: record.length,
      data: record,
    });
  } catch (err) {
    console.error("getIndent error:", err);
    const status = pickStatusCode(err, 404);
    return res.status(status).json({
      success: false,
      error: err.message || "Failed to fetch indent",
    });
  }
}

export async function listIndentsByStatus(req, res) {
  try {
    const statusType = req.params.statusType; // Get status from URL parameter
    let statusesToFetch = [];

    if (statusType.toLowerCase() === "approved") {
      statusesToFetch = ["APPROVED"];
    } else if (statusType.toLowerCase() === "rejected") {
      statusesToFetch = ["REJECTED"];
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid status type. Must be 'approved' or 'rejected'.",
      });
    }

    const { status: _status, ...paginationQuery } = req.query;
    const { rows, pagination } = await fetchIndents({
      statuses: statusesToFetch,
      ...paginationQuery,
    });
    return res.json({
      success: true,
      total: rows.length,
      data: rows,
      pagination,
    });
  } catch (err) {
    console.error("listIndentsByStatus error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch indents by status",
    });
  }
}

export async function updateIndentNumber(req, res) {
  const requestNumber = req.params.requestNumber;

  try {
    const { indent_number, actual_1 } = req.body;

    if (!indent_number || typeof indent_number !== "string") {
      return res.status(400).json({
        success: false,
        error: "indent_number is required and must be a string",
      });
    }

    const record = await updateIndentNumberService(
      requestNumber,
      indent_number.trim(),
      actual_1
    );

    return res.json({
      success: true,
      data: record,
    });
  } catch (err) {
    console.error("updateIndentNumber error:", err);
    const status = err.message?.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: err.message || "Failed to update indent_number",
    });
  }
}

