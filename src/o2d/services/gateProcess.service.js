const { getConnection } = require("../config/db.js");
const oracledb = require("oracledb");
const { generateCacheKey, withCache, DEFAULT_TTL } = require("../utils/cacheHelper.js");

const gateProcessQuery = `
select to_char(t.vrdate, 'dd/mm/yyyy hh24:mi:ss') as gate_entry_timestamp,
       t.vrno as gate_entry_number,
       t.order_vrno as loading_order_number,
       lhs_utility.get_name('acc_code', t.acc_code) as party_name,
       t.truckno,
       t.wslip_no as wslip_no,
       to_char(t.vrdate + interval '10' minute, 'dd/mm/yyyy hh24:mi:ss') as first_weight_planned,
       to_char(wb.indate, 'dd/mm/yyyy hh24:mi:ss') as first_weight_actual,
       case when wb.indate is null then 'PENDING' else 'COMPLETED' end as first_weight_status,
       to_char(wb.indate + interval '4' hour, 'dd/mm/yyyy hh24:mi:ss') as planned_second_weight,
       to_char(wb.outdate, 'dd/mm/yyyy hh24:mi:ss') as actual_second_weight,
       case when wb.outdate is null then 'PENDING' else 'COMPLETED' end as second_weight_status,
       to_char(wb.outdate + interval '10' minute, 'dd/mm/yyyy hh24:mi:ss') as planned_invoice_timestamp,
       to_char(it.vrdate, 'dd/mm/yyyy hh24:mi:ss') as actual_invoice_timestamp,
       case when it.vrdate is null then 'PENDING' else 'COMPLETED' end as invoice_status,
       it.vrno as invoice_number,
       to_char(it.vrdate + interval '30' minute, 'dd/mm/yyyy hh24:mi:ss') as gate_out_planned,
       to_char(t.outdate, 'dd/mm/yyyy hh24:mi:ss') as gate_out_actual,
       case when t.outdate is null then 'PENDING' else 'COMPLETED' end as gate_out_status
from view_gatetran_engine t
left join view_weighbridge_engine wb
       on wb.wslipno = t.wslip_no
      and wb.entity_code = t.entity_code
left join (
  select wslipno,
         entity_code,
         vrdate,
         vrno
  from (
    select b.wslipno,
           b.entity_code,
           b.vrdate,
           b.vrno,
           row_number() over (
             partition by b.wslipno, b.entity_code
             order by b.vrdate
           ) rn
    from view_itemtran_engine b
  )
  where rn = 1
) it
       on it.wslipno = t.wslip_no
      and it.entity_code = t.entity_code
where t.entity_code = :entityCode
      and t.series = 'SE'
      and t.outdate is null
order by t.vrdate asc`;

async function getGateProcessTimeline(entityCode = "SR") {
  const cacheKey = generateCacheKey("gate-process:timeline", { entityCode });
  const ttl = parseInt(process.env.GATE_PROCESS_CACHE_TTL_SECONDS, 10) || DEFAULT_TTL.TIMELINE;
  
  return await withCache(cacheKey, ttl, async () => {
    let connection;
    try {
      connection = await getConnection();
      const result = await connection.execute(
        gateProcessQuery,
        { entityCode },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return result.rows;
    } finally {
      if (connection) await connection.close();
    }
  });
}

module.exports = {
  getGateProcessTimeline,
};
