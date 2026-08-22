const INVALID_JSON_NUMBER_PATTERN = /(:\s*)(-?\d+(?:\.\d+)?)(\s*[,}\]])/g;
const METER_FIELD_DEFINITIONS = [
  { jsonKey: 'Timestamp', column: 'meter_timestamp', type: 'TEXT', responseKey: 'meterTimestamp' },
  { jsonKey: 'slave_id', column: 'slave_id', type: 'TEXT', responseKey: 'slaveId' },
  { jsonKey: 'V_R', column: 'v_r', type: 'NUMERIC', responseKey: 'vR' },
  { jsonKey: 'V_Y', column: 'v_y', type: 'NUMERIC', responseKey: 'vY' },
  { jsonKey: 'V_B', column: 'v_b', type: 'NUMERIC', responseKey: 'vB' },
  { jsonKey: 'V_AVG', column: 'v_avg', type: 'NUMERIC', responseKey: 'vAvg' },
  { jsonKey: 'I_R', column: 'i_r', type: 'NUMERIC', responseKey: 'iR' },
  { jsonKey: 'I_Y', column: 'i_y', type: 'NUMERIC', responseKey: 'iY' },
  { jsonKey: 'I_B', column: 'i_b', type: 'NUMERIC', responseKey: 'iB' },
  { jsonKey: 'KW_T', column: 'kw_t', type: 'NUMERIC', responseKey: 'kwT' },
  { jsonKey: 'KVAR_T', column: 'kvar_t', type: 'NUMERIC', responseKey: 'kvarT' },
  { jsonKey: 'KVA_T', column: 'kva_t', type: 'NUMERIC', responseKey: 'kvaT' },
  { jsonKey: 'PF_R', column: 'pf_r', type: 'NUMERIC', responseKey: 'pfR' },
  { jsonKey: 'PF_Y', column: 'pf_y', type: 'NUMERIC', responseKey: 'pfY' },
  { jsonKey: 'PF_B', column: 'pf_b', type: 'NUMERIC', responseKey: 'pfB' },
  { jsonKey: 'FREQ', column: 'freq', type: 'NUMERIC', responseKey: 'freq' },
  { jsonKey: 'KWH_IMP', column: 'kwh_imp', type: 'NUMERIC', responseKey: 'kwhImp' },
  { jsonKey: 'KWH_EXP', column: 'kwh_exp', type: 'NUMERIC', responseKey: 'kwhExp' },
  { jsonKey: 'KWH_NET', column: 'kwh_net', type: 'NUMERIC', responseKey: 'kwhNet' },
  { jsonKey: 'KVARH_IMP', column: 'kvarh_imp', type: 'NUMERIC', responseKey: 'kvarhImp' },
  { jsonKey: 'KVARH_EXP', column: 'kvarh_exp', type: 'NUMERIC', responseKey: 'kvarhExp' },
  { jsonKey: 'KVARH_NET', column: 'kvarh_net', type: 'NUMERIC', responseKey: 'kvarhNet' },
];
const ALLOWED_METER_FIELDS = METER_FIELD_DEFINITIONS.map((field) => field.jsonKey);

function normalizeNumericToken(token) {
  if (!/^-?\d+(?:\.\d+)?$/.test(token)) {
    return token;
  }

  if (/^-?0\d+/.test(token) || /^-?0+$/.test(token)) {
    const normalized = Number(token);

    if (Number.isFinite(normalized)) {
      return String(normalized);
    }
  }

  return token;
}

function sanitizeJsonLikePayload(rawPayload) {
  if (typeof rawPayload !== 'string' || rawPayload.length === 0) {
    return rawPayload;
  }

  return rawPayload.replace(INVALID_JSON_NUMBER_PATTERN, (match, prefix, token, suffix) => {
    const normalizedToken = normalizeNumericToken(token);
    return `${prefix}${normalizedToken}${suffix}`;
  });
}

function parsePayload(rawPayload) {
  if (typeof rawPayload !== 'string') {
    return {
      payload: rawPayload,
      normalizedRaw: rawPayload == null ? '' : String(rawPayload),
      parsed: typeof rawPayload === 'object' && rawPayload !== null,
    };
  }

  try {
    return {
      payload: JSON.parse(rawPayload),
      normalizedRaw: rawPayload,
      parsed: true,
    };
  } catch (error) {
    const sanitizedPayload = sanitizeJsonLikePayload(rawPayload);

    if (sanitizedPayload !== rawPayload) {
      try {
        const parsedPayload = JSON.parse(sanitizedPayload);

        return {
          payload: parsedPayload,
          normalizedRaw: JSON.stringify(parsedPayload),
          parsed: true,
        };
      } catch (sanitizedError) {
        return {
          payload: rawPayload,
          normalizedRaw: sanitizedPayload,
          parsed: false,
        };
      }
    }

    return {
      payload: rawPayload,
      normalizedRaw: rawPayload,
      parsed: false,
    };
  }
}

function projectAllowedPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const projectedPayload = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'DeviceUID')) {
    projectedPayload.DeviceUID = payload.DeviceUID;
  }

  const meterPayload = payload.Meter_1;
  if (meterPayload && typeof meterPayload === 'object' && !Array.isArray(meterPayload)) {
    projectedPayload.Meter_1 = Object.fromEntries(
      ALLOWED_METER_FIELDS.filter((fieldName) => Object.prototype.hasOwnProperty.call(meterPayload, fieldName)).map(
        (fieldName) => [fieldName, meterPayload[fieldName]]
      )
    );
  }

  return projectedPayload;
}

function normalizeStructuredValue(value, type) {
  if (value == null || value === '') {
    return null;
  }

  if (type === 'TEXT') {
    return String(value);
  }

  return String(value);
}

function extractStructuredPayloadValues(payload) {
  const projectedPayload = projectAllowedPayload(payload);
  const structuredValues = {
    device_uid:
      projectedPayload && typeof projectedPayload === 'object' && !Array.isArray(projectedPayload)
        ? projectedPayload.DeviceUID ?? null
        : null,
  };

  const meterPayload =
    projectedPayload && typeof projectedPayload === 'object' && !Array.isArray(projectedPayload)
      ? projectedPayload.Meter_1
      : null;

  for (const fieldDefinition of METER_FIELD_DEFINITIONS) {
    const rawValue =
      meterPayload && typeof meterPayload === 'object' && !Array.isArray(meterPayload)
        ? meterPayload[fieldDefinition.jsonKey]
        : null;

    structuredValues[fieldDefinition.column] = normalizeStructuredValue(rawValue, fieldDefinition.type);
  }

  return {
    payload: projectedPayload,
    values: structuredValues,
  };
}

module.exports = {
  ALLOWED_METER_FIELDS,
  METER_FIELD_DEFINITIONS,
  extractStructuredPayloadValues,
  parsePayload,
  projectAllowedPayload,
  sanitizeJsonLikePayload,
};
