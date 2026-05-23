const { Client } = require('pg');

const config = {
  host: '202.56.240.50',
  port: 5432,
  user: 'postgres',
  password: 'Sagar*$121',
  database: 'iot',
};

// --- DATA CLEANING LOGIC EXACTLY FROM summaryBuilder.js ---

const isNumber = (value) => value !== null && value !== undefined && Number.isFinite(value);

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const average = (values) => {
  const valid = values.filter(isNumber);
  if (valid.length === 0) {
    return null;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const cleanVoltage = (value) => {
  const numeric = safeNumber(value);
  if (!isNumber(numeric) || numeric < 50 || numeric > 300) {
    return null;
  }
  return numeric;
};

const cleanCurrent = (value) => {
  const numeric = safeNumber(value);
  if (!isNumber(numeric) || numeric < 0 || numeric > 500000) {
    return null;
  }
  if (numeric > 5000) {
    return null;
  }
  if (numeric > 100) {
    return numeric / 100;
  }
  return numeric;
};

const cleanPF = (value) => {
  const numeric = safeNumber(value);
  if (!isNumber(numeric)) {
    return null;
  }

  let pf = numeric;
  const absPf = Math.abs(pf);
  if (absPf > 100) {
    pf = pf / 1000;
  } else if (absPf > 1) {
    pf = pf / 100;
  }

  if (pf === 0 || pf === -1) {
    return pf;
  }

  const normalizedAbs = Math.abs(pf);
  if (normalizedAbs < 0.3 || normalizedAbs > 1) {
    return null;
  }

  return pf;
};

const calculateKw = (vr, vy, vb, ir, iy, ib, pf) => {
  if (![vr, vy, vb, ir, iy, ib, pf].every(isNumber)) {
    return null;
  }
  const pR = (vr * ir * pf) / 1000;
  const pY = (vy * iy * pf) / 1000;
  const pB = (vb * ib * pf) / 1000;
  return pR + pY + pB;
};

const normalizeDirectKw = (value, avgVoltage, avgCurrent) => {
  if (!isNumber(value) || value < 0) {
    return null;
  }
  const candidates = [value, value / 10, value / 100, value / 1000].filter(
    (candidate) => candidate >= 0 && candidate <= 250
  );
  const estimatedKw =
    isNumber(avgVoltage) && isNumber(avgCurrent) ? (avgVoltage * avgCurrent * 3) / 1000 : null;

  if (isNumber(estimatedKw) && estimatedKw > 0 && candidates.length > 0) {
    return candidates.reduce((best, candidate) => {
      if (best === null) {
        return candidate;
      }
      return Math.abs(candidate - estimatedKw) < Math.abs(best - estimatedKw) ? candidate : best;
    }, null);
  }

  if (candidates.length === 0) {
    return null;
  }
  const fallback = value > 100 ? value / 100 : value;
  return fallback <= 250 ? fallback : null;
};

const normalizeRecord = (row) => {
  const phaseVoltages = {
    r: cleanVoltage(row.v_r),
    y: cleanVoltage(row.v_y),
    b: cleanVoltage(row.v_b),
  };
  const phaseCurrents = {
    r: cleanCurrent(row.i_r),
    y: cleanCurrent(row.i_y),
    b: cleanCurrent(row.i_b),
  };

  const avgVoltage = average([
    phaseVoltages.r,
    phaseVoltages.y,
    phaseVoltages.b,
    cleanVoltage(row.v_avg),
  ]);
  const avgCurrent = average([phaseCurrents.r, phaseCurrents.y, phaseCurrents.b]);
  const pf = average([cleanPF(row.pf_r), cleanPF(row.pf_y), cleanPF(row.pf_b)]);
  
  const kwCalculated = calculateKw(
    phaseVoltages.r,
    phaseVoltages.y,
    phaseVoltages.b,
    phaseCurrents.r,
    phaseCurrents.y,
    phaseCurrents.b,
    pf
  );
  const kwDirect = normalizeDirectKw(safeNumber(row.kw_t), avgVoltage, avgCurrent);
  const kw = isNumber(kwCalculated) ? kwCalculated : kwDirect;

  // Exact running check:
  const isRunning = (avgCurrent ?? 0) > 0.05 || (kw ?? 0) > 0.05;

  return {
    avgVoltage,
    avgCurrent,
    kw,
    isRunning
  };
};

async function checkDatabaseData() {
  const client = new Client(config);
  try {
    await client.connect();
    console.log('Successfully connected to PostgreSQL at 202.56.240.50');

    // Query to get all aggregated 30-minute rows for today in Indian Standard Time (IST)
    const query = `
      SELECT 
        id,
        topic,
        device_uid,
        message_timestamp AT TIME ZONE 'Asia/Kolkata' as message_timestamp_ist,
        v_r, v_y, v_b, v_avg,
        i_r, i_y, i_b,
        kw_t,
        pf_r, pf_y, pf_b
      FROM mqtt_messages
      WHERE (message_timestamp AT TIME ZONE 'Asia/Kolkata')::date = CURRENT_DATE
      ORDER BY message_timestamp ASC, id ASC;
    `;

    const res = await client.query(query);
    console.log(`\nFound ${res.rows.length} rows in database for today.`);

    // Perform deduplication exactly like summaryBuilder.js
    const dedupedMap = new Map();

    for (const row of res.rows) {
      const timestamp = new Date(row.message_timestamp_ist);
      const device = row.device_uid || row.topic || 'Energy';
      
      const cleanData = normalizeRecord(row);

      const timeStr = timestamp.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      const record = {
        id: row.id,
        topic: row.topic,
        device: device,
        timestamp: timestamp,
        timeStr: timeStr,
        ...cleanData
      };

      const key = `${device}|${timestamp.toISOString()}`;
      dedupedMap.set(key, record);
    }

    const dedupedRecords = Array.from(dedupedMap.values()).sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
    console.log(`After Deduplication: ${dedupedRecords.length} unique interval records.`);

    let runningCount = 0;
    let stoppedCount = 0;
    const tableData = [];

    for (const record of dedupedRecords) {
      if (record.isRunning) {
        runningCount++;
      } else {
        stoppedCount++;
      }

      tableData.push({
        'ID': record.id,
        'Device': record.device,
        'Interval (IST)': record.timeStr,
        'Power kW (Cleaned)': record.kw !== null ? record.kw.toFixed(2) : 'null (0.0)',
        'Current A (Cleaned)': record.avgCurrent !== null ? record.avgCurrent.toFixed(2) : 'null (0.0)',
        'Status': record.isRunning ? 'RUNNING' : 'STOPPED'
      });
    }

    console.table(tableData);

    const runningMinutes = runningCount * 30;
    const stoppedMinutes = stoppedCount * 30;

    const runningHours = Math.floor(runningMinutes / 60);
    const runningMinsLeft = runningMinutes % 60;

    const stoppedHours = Math.floor(stoppedMinutes / 60);
    const stoppedMinsLeft = stoppedMinutes % 60;

    console.log('\n================ FINAL DEDUPED & CLEANED RESULTS ================');
    console.log(`Total Unique Intervals: ${dedupedRecords.length}`);
    console.log(`Running Intervals: ${runningCount} (${runningMinutes} minutes) -> ${runningHours}h ${runningMinsLeft}m`);
    console.log(`Stopped Intervals: ${stoppedCount} (${stoppedMinutes} minutes) -> ${stoppedHours}h ${stoppedMinsLeft}m`);
    console.log('==================================================================');

  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    await client.end();
  }
}

checkDatabaseData();
