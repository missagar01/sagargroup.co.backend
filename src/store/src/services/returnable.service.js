// src/services/returnable.service.js
import { getConnection } from "../config/db.js";
import oracledb from "../config/oracleClient.js";

/**
 * Fetches summarized counts for Returnable and Non-Returnable items for the current month.
 */
export async function getReturnableStats() {
    const conn = await getConnection();
    try {
        const sql = `
            SELECT 
                COUNT(*) as total_count,
                COUNT(CASE WHEN t.series = 'R3' THEN 1 END) as returnable_count,
                COUNT(CASE WHEN t.series = 'N3' THEN 1 END) as non_returnable_count,
                COUNT(CASE WHEN t.series = 'R3' AND (SELECT a.ref1_vrno FROM view_itemtran_engine a WHERE a.ref1_vrno = t.vrno AND a.entity_code='SR' AND a.trantype='RGP' AND a.item_code = t.item_code) IS NOT NULL THEN 1 END) as returnable_completed_count,
                COUNT(CASE WHEN t.series = 'R3' AND (SELECT a.ref1_vrno FROM view_itemtran_engine a WHERE a.ref1_vrno = t.vrno AND a.entity_code='SR' AND a.trantype='RGP' AND a.item_code = t.item_code) IS NULL THEN 1 END) as returnable_pending_count
            FROM view_itemtran_engine t
            WHERE t.entity_code = 'SR'
              AND t.series IN ('R3', 'N3')
              AND t.vrdate >= TO_DATE('01-FEB-2026', 'DD-MON-YYYY')
        `;
        const result = await conn.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const row = result.rows[0];
        return {
            TOTAL_COUNT: row.TOTAL_COUNT || 0,
            RETURNABLE_COUNT: row.RETURNABLE_COUNT || 0,
            NON_RETURNABLE_COUNT: row.NON_RETURNABLE_COUNT || 0,
            RETURNABLE_COMPLETED_COUNT: row.RETURNABLE_COMPLETED_COUNT || 0,
            RETURNABLE_PENDING_COUNT: row.RETURNABLE_PENDING_COUNT || 0
        };
    } finally {
        await conn.close();
    }
}

/**
 * Fetches detailed records for Returnable and Non-Returnable items for the current month.
 */
export async function getReturnableDetails() {
    const conn = await getConnection();
    try {
        const sql = `
            SELECT 
                CASE 
                    WHEN t.series = 'R3' THEN 'RETURNABLE' 
                    WHEN t.series = 'N3' THEN 'NON RETURANABLE' 
                    ELSE 'OTHER' 
                END AS gatepass_type,
                t.vrdate,
                t.vrno,
                lhs_utility.get_name('acc_code', t.acc_code) as party_name,
                t.item_code,
                t.item_name,
                t.remark,
                t.um as unit,
                t.qtyissued,
                (SELECT a.qtyrecd FROM view_itemtran_engine a WHERE a.ref1_vrno = t.vrno AND a.entity_code='SR' AND a.trantype='RGP' AND a.item_code = t.item_code) as qtyreceived,
                t.mobile,
                t.email,
                CASE 
                    WHEN (SELECT a.ref1_vrno FROM view_itemtran_engine a WHERE a.ref1_vrno = t.vrno AND a.entity_code='SR' AND a.trantype='RGP' AND a.item_code = t.item_code) IS NOT NULL 
                    THEN 'COMPLETED' 
                    ELSE 'PENDING' 
                END AS gatepass_status
            FROM view_itemtran_engine t
            WHERE t.entity_code = 'SR'
              AND t.series IN ('R3', 'N3')
              AND t.vrdate >= TO_DATE('01-FEB-2026', 'DD-MON-YYYY')
            ORDER BY t.vrdate DESC
        `;
        const result = await conn.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return result.rows;
    } finally {
        await conn.close();
    }
}
