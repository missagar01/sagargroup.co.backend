import axios from "axios";

const VENDOR_REGISTRATION_API_URL =
  process.env.STORE_VENDOR_REGISTRATION_API_URL ||
  process.env.VENDOR_REGISTRATION_API_URL ||
  null;

const REQUEST_TIMEOUT_MS = Number(
  process.env.STORE_VENDOR_REGISTRATION_TIMEOUT_MS || 15000
);
const CACHE_TTL_MS = Number(
  process.env.STORE_VENDOR_REGISTRATION_CACHE_TTL_MS || 5 * 60 * 1000
);

let cachedPayload = null;
let cacheExpiresAt = 0;
let inFlightRequest = null;

const HEADER_ALIASES = {
  timestamp: ["Timestamp", "timestamp"],
  supplierName: ["Supplier Name", "Vendor Name", "supplierName", "vendorName"],
  gstNo: ["GST NO", "GST No", "gstNo"],
  correspondenceAddress: ["Correspondence Address", "correspondenceAddress"],
  factoryOrFirmName: ["Factory or Firm Name", "Company Name", "factoryOrFirmName", "companyName"],
  yearOfEstablishment: ["Year of Establishment", "yearOfEstablishment"],
  productType: ["Product Type", "productType"],
  mobileNumber: ["Mobile Number", "mobileNumber"],
  email: ["Email", "email"],
  typeOfBusiness: ["Type of Business", "typeOfBusiness"],
  clientNames: ["Name of Clients", "clientNames"],
  companyOwnerName: ["Name Of Company Owner", "Name of Company Owner", "companyOwnerName"],
  ownerEmail: ["Email address", "Owner Email", "Email Address", "ownerEmail"],
  vendorRegistrationNumber: ["Vendor Registration Number", "vendorRegistrationNumber"],
  whatsappStatus: ["WhatsAppStatus", "WhatsApp Status", "whatsappStatus"],
};

const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const asText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const asKeyPart = (value) => normalizeHeader(asText(value)) || "na";

const buildHeaderIndex = (headers = []) => {
  const indexMap = new Map();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized && !indexMap.has(normalized)) {
      indexMap.set(normalized, index);
    }
  });
  return indexMap;
};

const buildObjectKeyMap = (record = {}) => {
  const keyMap = new Map();

  Object.keys(record || {}).forEach((key) => {
    const normalized = normalizeHeader(key);
    if (normalized && !keyMap.has(normalized)) {
      keyMap.set(normalized, key);
    }
  });

  return keyMap;
};

const getValueByHeaders = (row, headerIndex, aliases = []) => {
  for (const alias of aliases) {
    const matchedIndex = headerIndex.get(normalizeHeader(alias));
    if (matchedIndex !== undefined) {
      return row[matchedIndex];
    }
  }
  return null;
};

const getValueByObjectAliases = (record, keyMap, aliases = []) => {
  for (const alias of aliases) {
    const matchedKey = keyMap.get(normalizeHeader(alias));
    if (matchedKey !== undefined) {
      return record?.[matchedKey];
    }
  }
  return null;
};

const normalizeVendorRow = (row, headerIndex, index) => {
  const timestamp = asText(getValueByHeaders(row, headerIndex, HEADER_ALIASES.timestamp));
  const supplierName = asText(
    getValueByHeaders(row, headerIndex, HEADER_ALIASES.supplierName)
  );
  const vendorRegistrationNumber = asText(
    getValueByHeaders(row, headerIndex, HEADER_ALIASES.vendorRegistrationNumber)
  );

  const normalized = {
    id: `${asKeyPart(vendorRegistrationNumber)}-${asKeyPart(timestamp)}-${asKeyPart(
      supplierName
    )}-${index + 1}`,
    timestamp,
    supplierName,
    gstNo: asText(getValueByHeaders(row, headerIndex, HEADER_ALIASES.gstNo)),
    correspondenceAddress: asText(
      getValueByHeaders(row, headerIndex, HEADER_ALIASES.correspondenceAddress)
    ),
    factoryOrFirmName: asText(
      getValueByHeaders(row, headerIndex, HEADER_ALIASES.factoryOrFirmName)
    ),
    yearOfEstablishment: asText(
      getValueByHeaders(row, headerIndex, HEADER_ALIASES.yearOfEstablishment)
    ),
    productType: asText(getValueByHeaders(row, headerIndex, HEADER_ALIASES.productType)),
    mobileNumber: asText(getValueByHeaders(row, headerIndex, HEADER_ALIASES.mobileNumber)),
    email: asText(getValueByHeaders(row, headerIndex, HEADER_ALIASES.email)),
    typeOfBusiness: asText(
      getValueByHeaders(row, headerIndex, HEADER_ALIASES.typeOfBusiness)
    ),
    clientNames: asText(getValueByHeaders(row, headerIndex, HEADER_ALIASES.clientNames)),
    companyOwnerName: asText(
      getValueByHeaders(row, headerIndex, HEADER_ALIASES.companyOwnerName)
    ),
    ownerEmail: asText(getValueByHeaders(row, headerIndex, HEADER_ALIASES.ownerEmail)),
    vendorRegistrationNumber,
    whatsappStatus: asText(
      getValueByHeaders(row, headerIndex, HEADER_ALIASES.whatsappStatus)
    ).toUpperCase(),
  };

  const hasContent = Object.entries(normalized).some(
    ([key, value]) => key !== "id" && String(value || "").trim() !== ""
  );

  return hasContent ? normalized : null;
};

const sortVendorRecords = (records = []) =>
  records.sort((left, right) => {
    const leftTs = new Date(left.timestamp || 0).getTime();
    const rightTs = new Date(right.timestamp || 0).getTime();
    return rightTs - leftTs;
  });

const normalizeVendorObjectRecord = (record, index) => {
  const keyMap = buildObjectKeyMap(record);
  const timestamp = asText(
    getValueByObjectAliases(record, keyMap, HEADER_ALIASES.timestamp)
  );
  const supplierName = asText(
    getValueByObjectAliases(record, keyMap, HEADER_ALIASES.supplierName)
  );
  const vendorRegistrationNumber = asText(
    getValueByObjectAliases(
      record,
      keyMap,
      HEADER_ALIASES.vendorRegistrationNumber
    )
  );

  const normalized = {
    id: `${asKeyPart(vendorRegistrationNumber)}-${asKeyPart(timestamp)}-${asKeyPart(
      supplierName
    )}-${index + 1}`,
    timestamp,
    supplierName,
    gstNo: asText(getValueByObjectAliases(record, keyMap, HEADER_ALIASES.gstNo)),
    correspondenceAddress: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.correspondenceAddress)
    ),
    factoryOrFirmName: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.factoryOrFirmName)
    ),
    yearOfEstablishment: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.yearOfEstablishment)
    ),
    productType: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.productType)
    ),
    mobileNumber: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.mobileNumber)
    ),
    email: asText(getValueByObjectAliases(record, keyMap, HEADER_ALIASES.email)),
    typeOfBusiness: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.typeOfBusiness)
    ),
    clientNames: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.clientNames)
    ),
    companyOwnerName: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.companyOwnerName)
    ),
    ownerEmail: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.ownerEmail)
    ),
    vendorRegistrationNumber,
    whatsappStatus: asText(
      getValueByObjectAliases(record, keyMap, HEADER_ALIASES.whatsappStatus)
    ).toUpperCase(),
  };

  const hasContent = Object.entries(normalized).some(
    ([key, value]) => key !== "id" && String(value || "").trim() !== ""
  );

  return hasContent ? normalized : null;
};

const normalizeSheetPayload = (sheetData = []) => {
  const [headerRow, ...dataRows] = (sheetData || []).filter(Array.isArray);

  if (!Array.isArray(headerRow) || headerRow.length === 0) {
    throw new Error("Vendor registration sheet response is missing header row");
  }

  const headerIndex = buildHeaderIndex(headerRow);
  const records = sortVendorRecords(
    dataRows
      .map((row, index) => normalizeVendorRow(row, headerIndex, index))
      .filter(Boolean)
  );

  return records;
};

const normalizeObjectPayload = (rows = []) =>
  sortVendorRecords(
    (rows || [])
      .map((record, index) => normalizeVendorObjectRecord(record, index))
      .filter(Boolean)
  );

const getPayloadRows = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload)) return payload;
  return null;
};

const normalizeVendorPayload = (payload) => {
  const rows = getPayloadRows(payload);

  if (!Array.isArray(rows)) {
    throw new Error("Unexpected vendor registration response format");
  }

  if (rows.length === 0) {
    return [];
  }

  const firstRow = rows[0];

  if (Array.isArray(firstRow)) {
    return normalizeSheetPayload(rows);
  }

  if (firstRow && typeof firstRow === "object") {
    return normalizeObjectPayload(rows);
  }

  throw new Error("Unexpected vendor registration response format");
};

const fetchVendorRegistrationsFromSource = async () => {
  if (!VENDOR_REGISTRATION_API_URL) {
    throw new Error("STORE_VENDOR_REGISTRATION_API_URL is not configured");
  }

  const response = await axios.get(VENDOR_REGISTRATION_API_URL, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });

  const payload =
    typeof response.data === "string" ? JSON.parse(response.data) : response.data;

  const hasExplicitFailure =
    payload?.success === false ||
    String(payload?.status || "")
      .trim()
      .toLowerCase() === "error";

  if (!payload || hasExplicitFailure) {
    throw new Error("Unexpected vendor registration response format");
  }

  const records = normalizeVendorPayload(payload);
  return {
    data: records,
    fetchedAt: new Date().toISOString(),
    source: "live",
  };
};

export const getVendorRegistrations = async ({ bypassCache = false } = {}) => {
  const now = Date.now();
  if (!bypassCache && cachedPayload && now < cacheExpiresAt) {
    return {
      ...cachedPayload,
      source: "cache",
    };
  }

  if (!bypassCache && inFlightRequest) {
    return inFlightRequest;
  }

  const request = (async () => {
    try {
      const freshPayload = await fetchVendorRegistrationsFromSource();
      cachedPayload = freshPayload;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      return freshPayload;
    } catch (error) {
      if (cachedPayload) {
        return {
          ...cachedPayload,
          source: "stale-cache",
        };
      }
      throw error;
    } finally {
      if (inFlightRequest === request) {
        inFlightRequest = null;
      }
    }
  })();

  if (!bypassCache) {
    inFlightRequest = request;
  }

  return request;
};
