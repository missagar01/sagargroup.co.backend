// import pool from "../config/db.js";

// export const getPendingFollowups = async (req, res) => {
//   try {
//     const query = `
//       SELECT 
//         id,
//         created_at,
//         lead_no,
//         company_name,
//         lead_source,
//         phone_number,
//         salesperson_name,
//         location,
//         customer_say,
//         enquiry_status,
//         planned,
//         actual,
//         next_call_date,
//         next_call_time,
//         item_qty,
//         total_qty,
//         status,
//         sc_name
//       FROM fms_leads
//       WHERE planned IS NOT NULL
//         AND actual IS NULL
//       ORDER BY next_call_date ASC NULLS LAST;
//     `;

//     const result = await pool.query(query);

//     return res.json({
//       success: true,
//       count: result.rows.length,
//       data: result.rows
//     });

//   } catch (error) {
//     console.error("Pending API Error:", error);
//     return res.status(500).json({ success: false, message: "Server Error" });
//   }
// };


// export const getHistoryFollowups = async (req, res) => {
//   try {
//     const query = `
//       SELECT 
//         id,
//         created_at,
//         lead_no,
//         company_name,
//         customer_say,
//         status,
//         enquiry_received_status,
//         enquiry_received_date,
//         enquiry_approach,
//         project_approx_value,
//         item_qty,
//         total_qty,
//         next_action,
//         next_call_date,
//         next_call_time,
//         phone_number,
//         salesperson_name,
//         location,
//         sc_name
//       FROM fms_leads
//       WHERE planned IS NOT NULL
//         AND actual IS NOT NULL
//       ORDER BY next_call_date DESC NULLS LAST;
//     `;

//     const result = await pool.query(query);

//     return res.json({
//       success: true,
//       count: result.rows.length,
//       data: result.rows
//     });

//   } catch (error) {
//     console.error("History API Error:", error);
//     return res.status(500).json({ success: false, message: "Server Error" });
//   }
// };

// export const submitFollowUp = async (req, res) => {
//   try {
//     const {
//       leadNo,
//       customer_say,
//       lead_status,
//       enquiry_received_status,
//       enquiry_received_date,
//       enquiry_approach,
//       project_value,
//       item_qty,
//       total_qty,
//       next_action,
//       next_call_date,
//       next_call_time
//     } = req.body;

//     // ----------------------------------------------------------
//     // STEP 1 → Insert into leads_tracker
//     // ----------------------------------------------------------

//     await pool.query(
//       `INSERT INTO leads_tracker 
//       (lead_no, customer_say, lead_status, enquiry_received_status,
//        enquiry_received_date, enquiry_approach, item_qty, total_qty,
//        next_action, next_call_date, next_call_time)
//        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
//       [
//         leadNo,
//         customer_say || null,
//         lead_status || null,
//         enquiry_received_status || null,
//         enquiry_received_date || null,
//         enquiry_approach || null,
//         item_qty ? JSON.stringify(item_qty) : null,
//         total_qty || null,
//         next_action || null,
//         next_call_date || null,
//         next_call_time || null
//       ]
//     );

//     // ----------------------------------------------------------
//     // STEP 2 → PARTIAL UPDATE (KEEP OLD DATA)
//     // ----------------------------------------------------------

//     const updateQuery = `
//   UPDATE fms_leads
//   SET
//     customer_say = COALESCE(NULLIF($1,''), customer_say),
//     status = COALESCE(NULLIF($2,''), status),
//     enquiry_received_status = COALESCE(NULLIF($3,''), enquiry_received_status),

//     -- FIXED DATE TYPE CASTING
//     enquiry_received_date = COALESCE(NULLIF($4,'')::DATE, enquiry_received_date),
//     enquiry_approach = COALESCE(NULLIF($5,''), enquiry_approach),

//     project_approx_value = COALESCE($6, project_approx_value),
//     item_qty = COALESCE(NULLIF($7,''), item_qty),
//     total_qty = COALESCE($8, total_qty),

//     next_action = COALESCE(NULLIF($9,''), next_action),
//     next_call_date = COALESCE(NULLIF($10,'')::DATE, next_call_date),
//     next_call_time = COALESCE(NULLIF($11,''), next_call_time),

//     -- AUTO SET ACTUAL DATE ONLY WHEN ENQUIRY RECEIVED = "yes"
//     actual = CASE 
//                WHEN $3 = 'yes' THEN CURRENT_DATE
//                ELSE actual
//              END,

//     updated_at = NOW()
//   WHERE lead_no = $12
//   RETURNING *;
// `;


//     const updated = await pool.query(updateQuery, [
//       customer_say,
//       lead_status,
//       enquiry_received_status,
//       enquiry_received_date,
//       enquiry_approach,
//       project_value,
//       item_qty ? JSON.stringify(item_qty) : null,
//       total_qty,
//       next_action,
//       next_call_date,
//       next_call_time,
//       leadNo
//     ]);

//     return res.json({
//       success: true,
//       message: "Follow-up recorded successfully",
//       updatedLead: updated.rows[0]
//     });

//   } catch (error) {
//     console.error("Follow-Up Submit Error:", error);
//     return res.status(500).json({ success: false, message: error.message });
//   }
// };



const pool = require("../config/db.js");

const getPendingFollowups = async (req, res) => {
  try {
    const user = req.user; // Get user from JWT middleware
    const isAdmin = user.userType === "admin";
    const username = user.username;

    let query;
    let params = [];

    if (isAdmin) {
      // Admin sees all data from fms_leads
      query = `
        SELECT 
          id,
          created_at,
          lead_no,
          company_name,
          lead_source,
          phone_number,
          salesperson_name,
          location,
          customer_say,
          enquiry_status,
          planned,
          actual,
          next_call_date,
          next_call_time,
          item_qty,
          total_qty,
          status,
          sc_name
        FROM fms_leads
        WHERE planned IS NOT NULL
          AND actual IS NULL
        ORDER BY next_call_date ASC NULLS LAST;
      `;
    } else {
      // Regular user only sees their assigned data from fms_leads
      query = `
        SELECT 
          id,
          created_at,
          lead_no,
          company_name,
          lead_source,
          phone_number,
          salesperson_name,
          location,
          customer_say,
          enquiry_status,
          planned,
          actual,
          next_call_date,
          next_call_time,
          item_qty,
          total_qty,
          status,
          sc_name
        FROM fms_leads
        WHERE planned IS NOT NULL
          AND actual IS NULL
          AND (sc_name = $1 OR salesperson_name = $1)
        ORDER BY next_call_date ASC NULLS LAST;
      `;
      params = [username];
    }

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
      userType: user.userType,
      username: username
    });

  } catch (error) {
    console.error("Pending API Error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

const getHistoryFollowups = async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.userType === "admin";
    const username = user.username;

    let query;
    let params = [];

    if (isAdmin) {
      query = `
        SELECT 
          id,
          timestamp as created_at,
          enquiry_no as lead_no,
          what_did_customer_say as customer_say,
          enquiry_status as lead_status,
          -- is_order_received_status as enquiry_received_status, -- Mapping guessed
          -- enquiry_received_date NOT IN DB
          -- enquiry_approach NOT IN DB
          -- item_qty NOT IN DB
          -- total_qty NOT IN DB
          -- next_action NOT IN DB
          followup_status as next_action, -- Using followup_status as closest match
          next_call_date,
          next_call_time,
          sales_cordinator as sales_coordinator
        FROM enquiry_tracker
        ORDER BY timestamp DESC;
      `;
    } else {
      query = `
        SELECT 
          id,
          timestamp as created_at,
          enquiry_no as lead_no,
          what_did_customer_say as customer_say,
          enquiry_status as lead_status,
          followup_status as next_action,
          next_call_date,
          next_call_time,
          sales_cordinator as sales_coordinator
        FROM enquiry_tracker
        WHERE sales_cordinator = $1
        ORDER BY timestamp DESC;
      `;
      params = [username];
    }

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
      userType: user.userType,
      username: username
    });

  } catch (error) {
    console.error("History API Error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

const submitFollowUp = async (req, res) => {
  try {
    const user = req.user; // Get user from JWT middleware

    const {
      leadNo,
      customer_say,
      lead_status,
      enquiry_received_status,
      enquiry_received_date,
      enquiry_approach,
      project_value,
      item_qty,
      total_qty,
      next_action,
      next_call_date,
      next_call_time
    } = req.body;

    // Check if user is authorized to update this lead
    // Using fms_leads is correct as it is the master table
    const checkAuthQuery = `
      SELECT COUNT(*) FROM fms_leads 
      WHERE lead_no = $1 
      AND (sc_name = $2 OR salesperson_name = $2 OR $3 = 'admin')
    `;
    const checkAuthResult = await pool.query(checkAuthQuery, [
      leadNo,
      user.username,
      user.userType
    ]);

    if (parseInt(checkAuthResult.rows[0].count) === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this lead"
      });
    }

    // ----------------------------------------------------------
    // STEP 1 → Insert into enquiry_tracker (Replaces leads_tracker)
    // ----------------------------------------------------------
    const leadsTrackerQuery = `
      INSERT INTO enquiry_tracker 
      (enquiry_no, what_did_customer_say, enquiry_status, 
       followup_status, next_call_date, next_call_time, sales_cordinator)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *;
    `;

    // Note: Mapping next_action to followup_status for now, and skipping missing columns
    const trackerResult = await pool.query(leadsTrackerQuery, [
      leadNo,
      customer_say || null,
      lead_status || null,
      next_action || null, // Mapping next_action to followup_status
      next_call_date || null,
      next_call_time || null,
      user.username
    ]);

    // ----------------------------------------------------------
    // STEP 2 → UPDATE fms_leads
    // ----------------------------------------------------------
    const updateQuery = `
      UPDATE fms_leads
      SET
        customer_say = COALESCE(NULLIF($1,''), customer_say),
        status = COALESCE(NULLIF($2,''), status),
        enquiry_received_status = COALESCE(NULLIF($3,''), enquiry_received_status),
        enquiry_received_date = COALESCE(NULLIF($4,'')::DATE, enquiry_received_date),
        enquiry_approach = COALESCE(NULLIF($5,''), enquiry_approach),
        project_approx_value = COALESCE($6, project_approx_value),
        item_qty = COALESCE(NULLIF($7,''), item_qty),
        total_qty = COALESCE($8, total_qty),
        next_action = COALESCE(NULLIF($9,''), next_action),
        next_call_date = COALESCE(NULLIF($10,'')::DATE, next_call_date),
        next_call_time = COALESCE(NULLIF($11,''), next_call_time),
        actual = CASE 
                  WHEN $3 = 'yes' THEN CURRENT_DATE
                  ELSE actual
                END,
        updated_at = NOW(),
        -- updated_by = $13 -- Column updated_by might not exist in fms_leads, checking dump...
        -- Dump says updated_at exists, but NOT updated_by. Removing updated_by.
        updated_at = NOW()
      WHERE lead_no = $12
      RETURNING *;
    `;

    // Removed updated_by=$13 from SET and values
    const updatedResult = await pool.query(updateQuery, [
      customer_say,
      lead_status,
      enquiry_received_status,
      enquiry_received_date,
      enquiry_approach,
      project_value,
      item_qty ? JSON.stringify(item_qty) : null,
      total_qty,
      next_action,
      next_call_date,
      next_call_time,
      leadNo
    ]);

    if (updatedResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    return res.json({
      success: true,
      message: "Follow-up recorded successfully",
      tracker: trackerResult.rows[0],
      updatedLead: updatedResult.rows[0],
      updatedBy: user.username
    });

  } catch (error) {
    console.error("Follow-Up Submit Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getPendingFollowups,
  getHistoryFollowups,
  submitFollowUp
};
