const SLOT_MS = 10 * 60 * 1000;
const SLOT_SECONDS = SLOT_MS / 1000;
const SLOT_HOURS = SLOT_MS / (60 * 60 * 1000);
const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_LABELS = {
  day: 'Current Day',
  week: 'Last 7 Days',
  month: 'Last 30 Days',
};

const isNumber = (value) => value !== null && value !== undefined && Number.isFinite(value);

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const safeString = (value) => (typeof value === 'string' ? value.trim() : '');

const average = (values) => {
  const valid = values.filter(isNumber);
  if (valid.length === 0) {
    return null;
  }

  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const sumNumbers = (values) => {
  const valid = values.filter(isNumber);
  if (valid.length === 0) {
    return null;
  }

  return valid.reduce((sum, value) => sum + value, 0);
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

const cleanFreq = (value) => {
  const numeric = safeNumber(value);
  if (!isNumber(numeric) || numeric < 40 || numeric > 65) {
    return null;
  }

  return numeric;
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

const parseTimestamp = (message) => {
  const raw =
    safeString(message.messageTimestamp) ||
    safeString(message.createdAt) ||
    safeString(message.meterTimestamp);

  if (!raw) {
    return null;
  }

  const parsed = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDay = (date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const addDays = (date, days) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

const startOfWeek = (date) => {
  const clone = startOfDay(date);
  const dayIndex = clone.getDay();
  const offset = dayIndex === 0 ? -6 : 1 - dayIndex;
  clone.setDate(clone.getDate() + offset);
  return clone;
};

const startOfMonth = (date) => {
  const clone = startOfDay(date);
  clone.setDate(1);
  return clone;
};

const startOfRollingWindow = (date, totalDays) => {
  const clone = startOfDay(date);
  clone.setDate(clone.getDate() - Math.max(totalDays - 1, 0));
  return clone;
};

const floorToSlotStart = (date) => {
  const clone = new Date(date);
  const slotMinutes = Math.floor(clone.getMinutes() / 10) * 10;
  clone.setMinutes(slotMinutes, 0, 0);
  return clone;
};

const expectedSlotCount = (start, end) => {
  if (!start || !end || end < start) {
    return 0;
  }

  return Math.floor((end.getTime() - start.getTime()) / SLOT_MS) + 1;
};

const buildStatus = (uptimePct, mode) => {
  if (mode === 'day') {
    if (uptimePct <= 0) {
      return 'Down';
    }
    if (uptimePct < 85) {
      return 'Standby';
    }
    return 'Running';
  }

  if (uptimePct >= 94) {
    return 'Excellent';
  }
  if (uptimePct >= 88) {
    return 'Optimal';
  }
  return 'Normal';
};

const formatAlertValue = (value, unit = '', digits = 2) => {
  if (!isNumber(value)) {
    return '--';
  }

  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  return unit ? `${formatted} ${unit}` : formatted;
};

const normalizeRecord = (message) => {
  const timestamp = parseTimestamp(message);
  if (!timestamp) {
    return null;
  }

  const phaseVoltages = {
    r: cleanVoltage(message.vR),
    y: cleanVoltage(message.vY),
    b: cleanVoltage(message.vB),
  };
  const phaseCurrents = {
    r: cleanCurrent(message.iR),
    y: cleanCurrent(message.iY),
    b: cleanCurrent(message.iB),
  };

  const avgVoltage = average([
    phaseVoltages.r,
    phaseVoltages.y,
    phaseVoltages.b,
    cleanVoltage(message.vAvg),
  ]);
  const avgCurrent = average([phaseCurrents.r, phaseCurrents.y, phaseCurrents.b]);
  const pf = average([cleanPF(message.pfR), cleanPF(message.pfY), cleanPF(message.pfB)]);
  const kwCalculated = calculateKw(
    phaseVoltages.r,
    phaseVoltages.y,
    phaseVoltages.b,
    phaseCurrents.r,
    phaseCurrents.y,
    phaseCurrents.b,
    pf
  );
  const kwDirect = normalizeDirectKw(safeNumber(message.kwT), avgVoltage, avgCurrent);
  const kw = isNumber(kwCalculated) ? kwCalculated : kwDirect;
  const counters = {
    imp: safeNumber(message.kwhImp),
    exp: safeNumber(message.kwhExp),
    net: safeNumber(message.kwhNet),
  };

  const hasAnyMetric =
    isNumber(avgVoltage) ||
    isNumber(avgCurrent) ||
    isNumber(pf) ||
    isNumber(kw) ||
    isNumber(cleanFreq(message.freq)) ||
    Object.values(counters).some(isNumber);

  if (!hasAnyMetric) {
    return null;
  }

  return {
    id: String(message.id ?? ''),
    topic: safeString(message.topic) || 'Energy',
    device: safeString(message.deviceUid) || safeString(message.topic) || 'Energy',
    timestamp,
    avgVoltage,
    avgCurrent,
    pf,
    freq: cleanFreq(message.freq),
    kw,
    counters,
    isRunning: (avgCurrent ?? 0) > 0.05 || (kw ?? 0) > 0.05,
  };
};

const dedupeRecords = (records) => {
  const map = new Map();

  records.forEach((record) => {
    const key = `${record.device}|${record.timestamp.toISOString()}`;
    map.set(key, record);
  });

  return Array.from(map.values()).sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
};

const resolveCounterIntervalKwh = (previous, current, expectedKwh) => {
  if (!previous) {
    return expectedKwh;
  }

  if (!isNumber(expectedKwh) || expectedKwh <= 0.05) {
    return null;
  }

  const deltaCandidates = [current.counters.net, current.counters.imp, current.counters.exp]
    .map((value, index) => {
      const previousValue = [previous.counters.net, previous.counters.imp, previous.counters.exp][index];
      if (!isNumber(value) || !isNumber(previousValue)) {
        return null;
      }

      const delta = value - previousValue;
      return delta > 0 && delta < 100000 ? delta : null;
    })
    .filter(isNumber);

  if (deltaCandidates.length === 0) {
    return expectedKwh;
  }

  const scaledCandidates = [];
  const scalingOptions = [0.25, 0.1, 0.01, 1, 0.5, 0.001];

  deltaCandidates.forEach((delta) => {
    scalingOptions.forEach((scale) => {
      const candidate = delta * scale;
      if (candidate > 0 && candidate <= 500) {
        scaledCandidates.push(candidate);
      }
    });
  });

  if (scaledCandidates.length === 0) {
    return expectedKwh;
  }

  const best = scaledCandidates.reduce((winner, candidate) => {
    if (winner === null) {
      return candidate;
    }

    return Math.abs(candidate - expectedKwh) < Math.abs(winner - expectedKwh) ? candidate : winner;
  }, null);

  if (isNumber(best) && best >= expectedKwh * 0.1 && best <= expectedKwh * 5) {
    return best;
  }

  return expectedKwh;
};

const applyIntervalEnergy = (records) => {
  const previousByDevice = new Map();

  return records.map((record) => {
    const previous = previousByDevice.get(record.device) ?? null;
    const expectedKwh = isNumber(record.kw) ? record.kw * SLOT_HOURS : null;
    const intervalKwh = resolveCounterIntervalKwh(previous, record, expectedKwh);
    previousByDevice.set(record.device, record);

    return {
      ...record,
      intervalKwh,
    };
  });
};

const buildAlertSummary = (records) => {
  const items = [];
  let total = 0;
  const voltageAverage = average(records.map((record) => record.avgVoltage));
  const kwAverage = average(records.map((record) => record.kw));

  const pushAlert = (alert) => {
    total += 1;

    if (
      items.some(
        (existing) =>
          existing.type === alert.type &&
          existing.machine === alert.machine &&
          existing.time === alert.time
      )
    ) {
      return;
    }

    if (items.length < 6) {
      items.push(alert);
    }
  };

  [...records]
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .forEach((record) => {
      const machine = `Device - ${record.device}`;
      const time = record.timestamp.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (isNumber(record.kw) && ((isNumber(kwAverage) && record.kw > kwAverage * 1.35) || record.kw > 12)) {
        pushAlert({
          type: 'High Power',
          title: 'High Power Draw',
          machine,
          time,
          value: formatAlertValue(record.kw, 'kW'),
          severity: isNumber(kwAverage) && record.kw > kwAverage * 1.6 ? 'Critical' : 'Warning',
        });
      }

      if (isNumber(record.pf) && record.pf < 0.9) {
        pushAlert({
          type: 'Low PF',
          title: 'Low Power Factor',
          machine,
          time,
          value: formatAlertValue(record.pf, '', 2),
          severity: record.pf < 0.8 ? 'Critical' : 'Warning',
        });
      }

      if (isNumber(record.avgVoltage) && isNumber(voltageAverage) && Math.abs(record.avgVoltage - voltageAverage) > 8) {
        pushAlert({
          type: 'Voltage Drift',
          title: 'Voltage Drift',
          machine,
          time,
          value: formatAlertValue(record.avgVoltage, 'V', 1),
          severity: Math.abs(record.avgVoltage - voltageAverage) > 12 ? 'Critical' : 'Warning',
        });
      }

      // High Voltage / Low Voltage
      if (isNumber(record.avgVoltage)) {
        if (record.avgVoltage > 250) {
          pushAlert({
            type: 'High Voltage',
            title: 'High Voltage Detected',
            machine,
            time,
            value: formatAlertValue(record.avgVoltage, 'V', 1),
            severity: record.avgVoltage > 265 ? 'Critical' : 'Warning',
          });
        } else if (record.avgVoltage < 215) {
          pushAlert({
            type: 'Low Voltage',
            title: 'Low Voltage Detected',
            machine,
            time,
            value: formatAlertValue(record.avgVoltage, 'V', 1),
            severity: record.avgVoltage < 200 ? 'Critical' : 'Warning',
          });
        }
      }

      // High Current
      if (isNumber(record.avgCurrent) && record.avgCurrent > 12) {
        pushAlert({
          type: 'High Current',
          title: 'High Current Draw',
          machine,
          time,
          value: formatAlertValue(record.avgCurrent, 'A', 2),
          severity: record.avgCurrent > 20 ? 'Critical' : 'Warning',
        });
      }
    });

  return { total, items };
};

const getLatestDeviceStates = (records) => {
  const latestByDevice = new Map();

  records.forEach((record) => {
    latestByDevice.set(record.device, record);
  });

  return Array.from(latestByDevice.values());
};

const buildAggregate = (records, mode, rangeStart, rangeEnd) => {
  const latestDeviceStates = getLatestDeviceStates(records);
  const expectedSlotsPerDevice = expectedSlotCount(rangeStart, rangeEnd);
  const deviceCount = latestDeviceStates.length;
  const totalExpectedSlots = expectedSlotsPerDevice * Math.max(deviceCount, 1);
  const runningSlots = records.filter((record) => record.isRunning).length;
  const stoppedSlots = records.filter((record) => !record.isRunning).length;
  const runningTimeSeconds = runningSlots * SLOT_SECONDS;
  const stoppedTimeSeconds = stoppedSlots * SLOT_SECONDS;
  const totalDurationSeconds = totalExpectedSlots * SLOT_SECONDS;
  const uptimePct = totalDurationSeconds > 0 ? (runningTimeSeconds / totalDurationSeconds) * 100 : 0;
  const alertSummary = buildAlertSummary(records);
  const lastSummaryTime = records.length > 0 ? records[records.length - 1].timestamp.toISOString() : null;

  return {
    label: RANGE_LABELS[mode],
    startTime: rangeStart.toISOString(),
    endTime: rangeEnd.toISOString(),
    lastSummaryTime,
    nextSummaryTime: lastSummaryTime ? new Date(new Date(lastSummaryTime).getTime() + SLOT_MS).toISOString() : null,
    samples: records.length,
    totalEnergy: sumNumbers(records.map((record) => record.intervalKwh)),
    power: {
      avg: average(records.map((record) => record.kw)),
      min: records.map((record) => record.kw).filter(isNumber).reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY),
      max: records.map((record) => record.kw).filter(isNumber).reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY),
    },
    powerFactor: {
      avg: average(records.map((record) => record.pf)),
      min: records.map((record) => record.pf).filter(isNumber).reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY),
      max: records.map((record) => record.pf).filter(isNumber).reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY),
    },
    voltage: {
      avg: average(records.map((record) => record.avgVoltage)),
      min: records.map((record) => record.avgVoltage).filter(isNumber).reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY),
      max: records.map((record) => record.avgVoltage).filter(isNumber).reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY),
    },
    current: {
      avg: average(records.map((record) => record.avgCurrent)),
      min: records.map((record) => record.avgCurrent).filter(isNumber).reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY),
      max: records.map((record) => record.avgCurrent).filter(isNumber).reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY),
    },
    frequency: {
      avg: average(records.map((record) => record.freq)),
      min: records.map((record) => record.freq).filter(isNumber).reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY),
      max: records.map((record) => record.freq).filter(isNumber).reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY),
    },
    runningTimeSeconds,
    stoppedTimeSeconds,
    uptimePct,
    totalAlerts: alertSummary.total,
    alertItems: alertSummary.items,
    onlineDevices: latestDeviceStates.filter((record) => record.isRunning).length,
    offlineDevices: latestDeviceStates.filter((record) => !record.isRunning).length,
    deviceCount,
    status: buildStatus(uptimePct, mode),
  };
};

const normalizeAggregateExtremes = (aggregate) => {
  const sanitizeExtremes = (metric) => ({
    avg: isNumber(metric.avg) ? metric.avg : null,
    min: Number.isFinite(metric.min) ? metric.min : null,
    max: Number.isFinite(metric.max) ? metric.max : null,
  });

  return {
    ...aggregate,
    power: sanitizeExtremes(aggregate.power),
    powerFactor: sanitizeExtremes(aggregate.powerFactor),
    voltage: sanitizeExtremes(aggregate.voltage),
    current: sanitizeExtremes(aggregate.current),
    frequency: sanitizeExtremes(aggregate.frequency),
  };
};

const buildTrendBuckets = (records, mode, rangeStart, rangeEnd, anchorTime) => {
  if (mode === 'day') {
    const buckets = new Map();

    records.forEach((record) => {
      const slotStart = floorToSlotStart(record.timestamp);
      const key = slotStart.toISOString();

      if (!buckets.has(key)) {
        buckets.set(key, []);
      }

      buckets.get(key).push(record);
    });

    return Array.from(buckets.entries())
      .map(([key, bucketRecords]) => {
        const startTime = new Date(key);
        const endTime = new Date(startTime.getTime() + SLOT_MS);
        const aggregate = normalizeAggregateExtremes(buildAggregate(bucketRecords, 'day', startTime, startTime));

        return {
          label: `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          totalEnergy: aggregate.totalEnergy,
          averagePower: aggregate.power.avg,
          averageVoltage: aggregate.voltage.avg,
          averageCurrent: aggregate.current.avg,
          averagePf: aggregate.powerFactor.avg,
          averageFrequency: aggregate.frequency.avg,
          runningTimeSeconds: aggregate.runningTimeSeconds,
          status: aggregate.status,
        };
      })
      .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
  }

  if (mode === 'week') {
    const buckets = new Map();

    records.forEach((record) => {
      const startTime = startOfDay(record.timestamp);
      const key = startTime.toISOString();

      if (!buckets.has(key)) {
        buckets.set(key, []);
      }

      buckets.get(key).push(record);
    });

    return Array.from(buckets.entries())
      .map(([key, bucketRecords]) => {
        const startTime = new Date(key);
        const endTime = new Date(startTime.getTime() + DAY_MS - 1);
        const aggregate = normalizeAggregateExtremes(buildAggregate(bucketRecords, 'week', startTime, endTime));

        return {
          label: startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          totalEnergy: aggregate.totalEnergy,
          averagePower: aggregate.power.avg,
          averageVoltage: aggregate.voltage.avg,
          averageCurrent: aggregate.current.avg,
          averagePf: aggregate.powerFactor.avg,
          averageFrequency: aggregate.frequency.avg,
          runningTimeSeconds: aggregate.runningTimeSeconds,
          status: aggregate.status,
        };
      })
      .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
  }

  const monthStart = rangeStart ? startOfDay(rangeStart) : startOfMonth(anchorTime);
  const monthEnd = rangeEnd ? new Date(rangeEnd) : anchorTime;
  const buckets = [];
  let bucketStart = monthStart;

  while (bucketStart <= monthEnd) {
    const tentativeEnd = addDays(bucketStart, 6);
    tentativeEnd.setHours(23, 59, 59, 999);
    const bucketEnd = new Date(Math.min(tentativeEnd.getTime(), monthEnd.getTime()));
    const bucketStop = new Date(bucketEnd.getTime());
    bucketStop.setHours(23, 59, 59, 999);
    const bucketRecords = records.filter(
      (record) => record.timestamp >= bucketStart && record.timestamp <= bucketStop
    );

    if (bucketRecords.length > 0) {
      const aggregate = normalizeAggregateExtremes(buildAggregate(bucketRecords, 'month', bucketStart, bucketEnd));

      buckets.push({
        label: `${bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${bucketEnd.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}`,
        startTime: bucketStart.toISOString(),
        endTime: bucketEnd.toISOString(),
        totalEnergy: aggregate.totalEnergy,
        averagePower: aggregate.power.avg,
        averageVoltage: aggregate.voltage.avg,
        averageCurrent: aggregate.current.avg,
        averagePf: aggregate.powerFactor.avg,
        averageFrequency: aggregate.frequency.avg,
        runningTimeSeconds: aggregate.runningTimeSeconds,
        status: aggregate.status,
      });
    }

    bucketStart = addDays(bucketStart, 7);
  }

  return buckets;
};

const buildDeviceSummary = (records) => {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.device)) {
      grouped.set(record.device, []);
    }

    grouped.get(record.device).push(record);
  });

  return Array.from(grouped.entries())
    .map(([device, deviceRecords]) => {
      const latest = deviceRecords[deviceRecords.length - 1];

      return {
        name: `Device - ${device}`,
        totalEnergy: sumNumbers(deviceRecords.map((record) => record.intervalKwh)),
        averagePower: average(deviceRecords.map((record) => record.kw)),
        averageVoltage: average(deviceRecords.map((record) => record.avgVoltage)),
        averageCurrent: average(deviceRecords.map((record) => record.avgCurrent)),
        powerFactor: average(deviceRecords.map((record) => record.pf)),
        runningTimeSeconds: deviceRecords.filter((record) => record.isRunning).length * SLOT_SECONDS,
        status: latest?.isRunning ? 'Online' : 'Offline',
        lastSeenAt: latest?.timestamp.toISOString() ?? null,
      };
    })
    .sort((left, right) => (right.totalEnergy ?? -1) - (left.totalEnergy ?? -1));
};

const buildPeriodPayload = (records, mode, rangeStart, rangeEnd, anchorTime) => {
  const aggregate = normalizeAggregateExtremes(buildAggregate(records, mode, rangeStart, rangeEnd));

  return {
    rangeKey: mode,
    ...aggregate,
    trend: buildTrendBuckets(records, mode, rangeStart, rangeEnd, anchorTime),
    devices: buildDeviceSummary(records),
  };
};

const buildEmptyPeriod = (mode, rangeStart, rangeEnd, lastSummaryTime = null) => {
  const startTime = rangeStart ? rangeStart.toISOString() : null;
  const endTime = rangeEnd ? rangeEnd.toISOString() : null;
  const lastSummaryTimeIso = lastSummaryTime ? lastSummaryTime.toISOString() : null;

  return {
    rangeKey: mode,
    label: RANGE_LABELS[mode],
    startTime,
    endTime,
    lastSummaryTime: lastSummaryTimeIso,
    nextSummaryTime: lastSummaryTimeIso
      ? new Date(new Date(lastSummaryTimeIso).getTime() + SLOT_MS).toISOString()
      : null,
    samples: 0,
    totalEnergy: null,
    power: { avg: null, min: null, max: null },
    powerFactor: { avg: null, min: null, max: null },
    voltage: { avg: null, min: null, max: null },
    current: { avg: null, min: null, max: null },
    frequency: { avg: null, min: null, max: null },
    runningTimeSeconds: 0,
    stoppedTimeSeconds: 0,
    uptimePct: 0,
    totalAlerts: 0,
    alertItems: [],
    onlineDevices: 0,
    offlineDevices: 0,
    deviceCount: 0,
    status: buildStatus(0, mode),
    trend: [],
    devices: [],
  };
};

function buildDashboardSummary(messages) {
  const normalizedRecords = dedupeRecords(
    messages.map((message) => normalizeRecord(message)).filter(Boolean)
  );
  const records = applyIntervalEnergy(normalizedRecords);
  const anchorRecord = records.length > 0 ? records[records.length - 1] : null;
  const anchorTime = anchorRecord?.timestamp ?? null;
  const now = new Date();

  if (Number.isNaN(now.getTime())) {
    throw new Error('Failed to resolve the current server time for IoT dashboard summary');
  }

  if (!anchorTime) {
    return {
      anchorTime: null,
      generatedAt: now.toISOString(),
      periods: {
        day: buildEmptyPeriod('day', null, null, null),
        week: buildEmptyPeriod('week', null, null, null),
        month: buildEmptyPeriod('month', null, null, null),
      },
    };
  }

  const dayStart = startOfDay(now);
  const weekStart = startOfRollingWindow(now, 7);
  const monthStart = startOfRollingWindow(now, 30);
  const dayRecords = records.filter((record) => record.timestamp >= dayStart && record.timestamp <= now);
  const weekRecords = records.filter((record) => record.timestamp >= weekStart && record.timestamp <= now);
  const monthRecords = records.filter((record) => record.timestamp >= monthStart && record.timestamp <= now);

  return {
    anchorTime: anchorTime.toISOString(),
    generatedAt: now.toISOString(),
    periods: {
      day:
        dayRecords.length > 0
          ? buildPeriodPayload(dayRecords, 'day', dayStart, now, now)
          : buildEmptyPeriod('day', dayStart, now, anchorTime),
      week:
        weekRecords.length > 0
          ? buildPeriodPayload(weekRecords, 'week', weekStart, now, now)
          : buildEmptyPeriod('week', weekStart, now, anchorTime),
      month:
        monthRecords.length > 0
          ? buildPeriodPayload(monthRecords, 'month', monthStart, now, now)
          : buildEmptyPeriod('month', monthStart, now, anchorTime),
    },
  };
}

module.exports = {
  buildDashboardSummary,
};
