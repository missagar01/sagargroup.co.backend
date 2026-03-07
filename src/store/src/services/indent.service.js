import { withPgTransaction, withPgClient } from "../config/postgres.js";
import { getHODByDepartment } from "./department.service.js";
import { sendWhatsApp } from "../utils/whatsapp.js";

const VALID_FORM_TYPES = new Set(["INDENT", "REQUISITION"]);
const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);

const ADVISORY_LOCK_KEYS = {
  INDENT: 19101,
  REQUISITION: 19102,
};

const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGE_LIMIT = 500;

function normalizeTimestamp(input, fallback = null) {
  if (input === undefined || input === null || input === "") return fallback;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function normalizeDateOnly(input) {
  if (input === undefined || input === null || input === "") return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function deriveDateInterval(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return null;
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000);
  return `${diffDays} days`;
}

function coalesceValue(primary, secondary, fallback = null) {
  if (primary !== undefined && primary !== null) return primary;
  if (secondary !== undefined && secondary !== null) return secondary;
  return fallback;
}

function toNumberOrNull(input) {
  if (input === undefined || input === null || input === "") return null;
  const num = Number(input);
  return Number.isFinite(num) ? num : null;
}

function normalizePaginationLimit(input) {
  if (input === undefined || input === null || input === "") {
    return DEFAULT_PAGE_LIMIT;
  }
  const candidate = Number(input);
  if (!Number.isFinite(candidate)) {
    return DEFAULT_PAGE_LIMIT;
  }
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(candidate)));
}

function normalizePaginationOffset(input) {
  if (input === undefined || input === null || input === "") {
    return 0;
  }
  const candidate = Number(input);
  if (!Number.isFinite(candidate)) {
    return 0;
  }
  return Math.max(0, Math.floor(candidate));
}

function hasField(obj, ...keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

async function acquireSequenceLock(client, formType) {
  const key = ADVISORY_LOCK_KEYS[formType] || ADVISORY_LOCK_KEYS.INDENT;
  await client.query("SELECT pg_advisory_xact_lock($1)", [key]);
}

async function generateRequestNumber(client, formType) {
  const normalizedType = formType === "REQUISITION" ? "REQUISITION" : "INDENT";
  const prefix = normalizedType === "REQUISITION" ? "REQ" : "IND";

  await acquireSequenceLock(client, normalizedType);
  const { rows } = await client.query(
    `
      SELECT COALESCE(MAX(CAST(substring(request_number FROM '\\d+$') AS INTEGER)), 0) AS max_seq
      FROM indent
      WHERE form_type = $1
    `,
    [normalizedType]
  );

  const currentMax = Number(rows[0]?.max_seq || 0);
  const nextSeq = currentMax + 1;
  return `${prefix}${String(nextSeq).padStart(2, "0")}`;
}

export async function createIndent(formPayload) {
  const sampleTimestamp =
    normalizeTimestamp(
      formPayload.sample_timestamp ?? formPayload.sampleTimestamp
    ) || new Date().toISOString();

  const formTypeRaw = coalesceValue(formPayload.form_type, formPayload.formType, "INDENT");
  const formType = String(formTypeRaw).toUpperCase();
  if (!VALID_FORM_TYPES.has(formType)) {
    throw new Error("Invalid form_type. Allowed values: INDENT or REQUISITION");
  }

  const providedRequestNumber =
    formPayload.request_number ??
    formPayload.requestNumber ??
    null;

  const requestQty = toNumberOrNull(formPayload.request_qty ?? formPayload.requestQty);

  const planned1 =
    normalizeTimestamp(formPayload.planned_1 ?? formPayload.planned1) ||
    sampleTimestamp;

  return withPgTransaction(async (client) => {
    const requestNumber =
      providedRequestNumber && typeof providedRequestNumber === "string"
        ? providedRequestNumber.trim().toUpperCase()
        : await generateRequestNumber(client, formType);
    if (!requestNumber) {
      throw new Error("Failed to derive request_number");
    }

    const createdAt = normalizeTimestamp(
      formPayload.created_at ?? formPayload.createdAt,
      new Date().toISOString()
    );

    const insertSql = `
      INSERT INTO indent (
        sample_timestamp,
        form_type,
        request_number,
        indent_series,
        requester_name,
        department,
        division,
        item_code,
        product_name,
        request_qty,
        uom,
        specification,
        make,
        purpose,
        cost_location,
        group_name,
        planned_1,
        request_status,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20
      )
      RETURNING *
    `;

    const values = [
      sampleTimestamp,
      formType,
      requestNumber,
      formPayload.indent_series ?? formPayload.indentSeries ?? null,
      formPayload.requester_name ?? formPayload.requesterName ?? null,
      formPayload.department ?? null,
      formPayload.division ?? null,
      formPayload.item_code ?? formPayload.itemCode ?? null,
      formPayload.product_name ?? formPayload.productName ?? null,
      requestQty,
      formPayload.uom ?? null,
      formPayload.specification ?? formPayload.specifications ?? null,
      formPayload.make ?? null,
      formPayload.purpose ?? null,
      formPayload.cost_location ?? formPayload.costLocation ?? null,
      formPayload.group_name ?? formPayload.groupName ?? null,
      planned1,
      formPayload.request_status ?? formPayload.requestStatus ?? "PENDING",
      createdAt,
      createdAt,
    ];

    const { rows } = await client.query(insertSql, values);
    const createdRecord = rows[0];

    // Trigger WhatsApp Notification asynchronously
    if (createdRecord) {
      (async () => {
        try {
          const hodInfo = await getHODByDepartment(createdRecord.department);
          if (hodInfo && hodInfo.mobile_number) {
            const msg = `🔔 *New ${createdRecord.form_type} Received*\n\n` +
              `*Request No:* ${createdRecord.request_number}\n` +
              `*Requester:* ${createdRecord.requester_name}\n` +
              `*Department:* ${createdRecord.department}\n` +
              `*Item:* ${createdRecord.product_name}\n` +
              `*Quantity:* ${createdRecord.request_qty} ${createdRecord.uom || ''}\n` +
              `*Purpose:* ${createdRecord.purpose || 'N/A'}\n\n` +
              `Please review and approve.`;

            await sendWhatsApp(hodInfo.mobile_number, msg);
            console.log(`[indent.service.js] WhatsApp sent to HOD of ${createdRecord.department}`);
          } else {
            console.warn(`[indent.service.js] No HOD/Mobile found for dept: ${createdRecord.department}`);
          }
        } catch (waErr) {
          console.error("[indent.service.js] Failed to send WhatsApp:", waErr);
        }
      })();
    }

    return createdRecord;
  });
}

export async function updateIndentStatus(requestNumber, updates) {
  if (!requestNumber) {
    throw new Error("requestNumber is required");
  }
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("Invalid update payload");
  }

  return withPgTransaction(async (client) => {
    const rows = await fetchRowsForRequestNumber(client, requestNumber);
    if (!rows.length) {
      throw new Error(`Indent with request_number ${requestNumber} not found`);
    }
    const targetRow = resolveTargetRow(rows, updates);
    return applyUpdateToRow(client, targetRow, updates);
  });
}

export async function updateIndentStatusBulk(requestNumber, updatesList = []) {
  if (!requestNumber) {
    throw new Error("requestNumber is required");
  }
  if (!Array.isArray(updatesList) || !updatesList.length) {
    throw new Error("Update array is required");
  }

  return withPgTransaction(async (client) => {
    const rows = await fetchRowsForRequestNumber(client, requestNumber);
    if (!rows.length) {
      throw new Error(`Indent with request_number ${requestNumber} not found`);
    }

    const remainingRows = [...rows];
    const updatedRows = [];

    for (const update of updatesList) {
      if (!update || typeof update !== "object") {
        throw new Error("Invalid update payload in array");
      }

      const row = resolveTargetRow(
        update?.id || update?.row_id || update?.rowId ? rows : remainingRows,
        update
      );

      if (!update?.id && !update?.row_id && !update?.rowId) {
        const idx = remainingRows.indexOf(row);
        if (idx >= 0) {
          remainingRows.splice(idx, 1);
        }
      }

      const updated = await applyUpdateToRow(client, row, update);
      updatedRows.push(updated);
    }

    return updatedRows;
  });
}

async function fetchRowsForRequestNumber(client, requestNumber) {
  const { rows } = await client.query(
    `
      SELECT *
      FROM indent
      WHERE request_number = $1
      ORDER BY created_at ASC
    `,
    [requestNumber]
  );
  return rows;
}

function resolveTargetRow(rows, updatePayload) {
  if (!rows || !rows.length) throw new Error("No rows available for update");

  const idKey = updatePayload?.id ?? updatePayload?.row_id ?? updatePayload?.rowId;
  if (idKey !== undefined && idKey !== null && idKey !== "") {
    const match = rows.find((row) => String(row.id) === String(idKey));
    if (!match) {
      throw new Error(`Indent row with id ${idKey} not found`);
    }
    return match;
  }

  const itemCode = updatePayload?.item_code ?? updatePayload?.itemCode ?? null;
  if (itemCode) {
    const match = rows.find((row) => String(row.item_code) === String(itemCode));
    if (match) {
      return match;
    }
  }

  return rows[0];
}

async function applyUpdateToRow(client, existing, updates) {
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  const nextStatusRaw = updates.request_status ?? updates.requestStatus;
  let nextStatus = null;
  if (nextStatusRaw) {
    const candidate = String(nextStatusRaw).toUpperCase();
    if (!VALID_STATUSES.has(candidate)) {
      throw new Error("Invalid request_status");
    }
    nextStatus = candidate;
    values.push(candidate);
    setClauses.push(`request_status = $${paramIndex++}`);
  }

  const approvedQtyRaw = updates.approved_quantity ?? updates.approvedQuantity;
  if (approvedQtyRaw !== undefined) {
    const qty = toNumberOrNull(approvedQtyRaw);
    if (qty === null) {
      throw new Error("approved_quantity must be a valid number");
    }
    values.push(qty);
    setClauses.push(`approved_quantity = $${paramIndex++}`);
  }

  const gmApprovalRaw = updates.gm_approval ?? updates.gmApproval;
  if (gmApprovalRaw) {
    const candidate = String(gmApprovalRaw).toUpperCase();
    if (!VALID_STATUSES.has(candidate)) {
      throw new Error("Invalid gm_approval status");
    }
    values.push(candidate);
    setClauses.push(`gm_approval = $${paramIndex++}`);
  }

  const hasActual1 = "actual_1" in updates || "actual1" in updates;
  if (hasActual1) {
    const explicitActual1 = normalizeTimestamp(updates.actual_1 ?? updates.actual1);
    if (explicitActual1) {
      const actual1ParamIndex = paramIndex;
      values.push(explicitActual1);
      setClauses.push(`actual_1 = $${paramIndex}::timestamptz`);
      paramIndex += 1;
      setClauses.push(
        `time_delay_1 = ($${actual1ParamIndex}::timestamptz - COALESCE(planned_1, sample_timestamp))`
      );
    } else {
      setClauses.push(`actual_1 = NULL`);
    }
  }

  if (!setClauses.length) {
    throw new Error("No valid fields provided for update");
  }

  setClauses.push("updated_at = NOW()");
  values.push(existing.id);
  const updateSql = `
    UPDATE indent
    SET ${setClauses.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const { rows } = await client.query(updateSql, values);
  return rows[0];
}

export async function fetchIndents(options = {}) {
  const { status, statuses } = options;
  const limitCandidate =
    options.limit ??
    options.pageSize ??
    options.page_size ??
    options.pageLimit ??
    options.page_limit ??
    null;
  const offsetCandidate =
    options.offset ??
    options.page ??
    options.page_offset ??
    options.pageOffset ??
    options.cursor ??
    options.start ??
    null;
  const limit = normalizePaginationLimit(limitCandidate);
  const offset = normalizePaginationOffset(offsetCandidate);

  return withPgClient(async (client) => {
    const whereParts = [];
    const values = [];
    let paramIndex = 1;

    const normalizedStatuses = [];
    if (Array.isArray(statuses)) {
      normalizedStatuses.push(...statuses);
    }

    if (status) {
      const splits = String(status)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      normalizedStatuses.push(...splits);
    }

    const cleanedStatuses = [...new Set(normalizedStatuses.map((s) => s.toUpperCase()))];

    if (cleanedStatuses.length) {
      cleanedStatuses.forEach((s) => {
        if (!VALID_STATUSES.has(s)) {
          throw new Error(`Invalid request_status filter: ${s}`);
        }
      });
      const placeholders = cleanedStatuses.map(() => `$${paramIndex++}`);
      whereParts.push(`request_status IN (${placeholders.join(", ")})`);
      values.push(...cleanedStatuses);
    }

    const fromDateRaw =
      options.fromDate ??
      options.from_date ??
      options.startDate ??
      options.start_date ??
      null;
    const toDateRaw =
      options.toDate ??
      options.to_date ??
      options.endDate ??
      options.end_date ??
      null;

    const fromDate = normalizeDateOnly(fromDateRaw);
    const toDate = normalizeDateOnly(toDateRaw);

    if (fromDate) {
      whereParts.push(`sample_timestamp >= $${paramIndex}::date`);
      values.push(fromDate);
      paramIndex += 1;
    }

    if (toDate) {
      whereParts.push(`sample_timestamp < ($${paramIndex}::date + INTERVAL '1 day')`);
      values.push(toDate);
      paramIndex += 1;
    }

    const productNameRaw = options.productName ?? options.product_name ?? null;
    if (productNameRaw && String(productNameRaw).trim().length) {
      whereParts.push(`product_name ILIKE $${paramIndex}`);
      values.push(`%${String(productNameRaw).trim()}%`);
      paramIndex += 1;
    }

    const requesterNameRaw = options.requesterName ?? options.requester_name ?? null;
    if (requesterNameRaw && String(requesterNameRaw).trim().length) {
      whereParts.push(`requester_name ILIKE $${paramIndex}`);
      values.push(`%${String(requesterNameRaw).trim()}%`);
      paramIndex += 1;
    }

    const sql = `
      SELECT *
      FROM indent
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY created_at DESC
    `;

    const limitParamIndex = paramIndex;
    paramIndex += 1;
    const offsetParamIndex = paramIndex;
    paramIndex += 1;
    const paginatedSql = `
      ${sql}
      LIMIT $${limitParamIndex}
      OFFSET $${offsetParamIndex}
    `;
    values.push(limit + 1);
    values.push(offset);

    const { rows } = await client.query(paginatedSql, values);
    const hasMore = rows.length > limit;
    const paginatedRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      rows: paginatedRows,
      pagination: {
        limit,
        offset,
        hasMore,
        nextOffset: offset + limit,
      },
    };
  });
}

export async function fetchIndentByRequestNumber(requestNumber) {
  if (!requestNumber) {
    throw new Error("requestNumber is required");
  }

  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `
        SELECT *
        FROM indent
        WHERE request_number = $1
        ORDER BY created_at ASC
      `,
      [requestNumber]
    );

    return rows;
  });
}


export async function updateIndentNumberService(requestNumber, indentNumber, actual1 = null) {
  if (!requestNumber) {
    throw new Error("requestNumber is required");
  }

  if (!indentNumber) {
    throw new Error("indent_number is required");
  }

  return withPgTransaction(async (client) => {
    // Ensure indent exists
    const { rows: existingRows } = await client.query(
      `
        SELECT id
        FROM indent
        WHERE request_number = $1
        LIMIT 1
      `,
      [requestNumber]
    );

    if (!existingRows.length) {
      throw new Error(`Indent with request_number ${requestNumber} not found`);
    }

    const setClauses = ["indent_number = $1", "updated_at = NOW()"];
    const values = [indentNumber];

    if (actual1) {
      setClauses.push(`actual_1 = $${values.length + 1}::timestamptz`);
      values.push(actual1);
    }

    values.push(requestNumber);
    const whereClause = `WHERE request_number = $${values.length}`;

    // Update indent_number and optional actual_1
    const { rows } = await client.query(
      `
        UPDATE indent
        SET ${setClauses.join(", ")}
        ${whereClause}
        RETURNING *
      `,
      values
    );

    return rows;
  });
}
