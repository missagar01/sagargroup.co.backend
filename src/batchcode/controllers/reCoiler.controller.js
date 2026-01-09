const { StatusCodes } = require('http-status-codes');
const reCoilerService = require('../services/reCoiler.service');
const { buildResponse } = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const hotCoilRepository = require('../repositories/hotCoil.repository');

const parseIntegerParam = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, `${fieldName} must be an integer`);
  }
  return parsed;
};

const normalizeStringParam = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const createEntry = async (req, res) => {
  const payload = await reCoilerService.createReCoiler(req.body);
  
  // Send WhatsApp notification
  const whatsappService = require('../utils/whatsapp.service');
  const records = Array.isArray(payload) ? payload : [payload];
  
  for (const record of records) {
    if (!record.error && record.hot_coiler_short_code) {
      // Fetch hot coil data for the message
      const hotCoilRows = await hotCoilRepository.findHotCoilEntries({
        smsShortCode: record.hot_coiler_short_code
      });
      const hotCoilData = hotCoilRows.length > 0 ? hotCoilRows[0] : null;
      
      whatsappService.sendReCoilerNotification(record, hotCoilData).catch((error) => {
        console.error('Error sending WhatsApp notification for ReCoiler:', error);
      });
    }
  }
  
  res.status(StatusCodes.CREATED).json(buildResponse('Re-Coiler entry recorded', payload));
};

const listEntries = async (req, res) => {
  const id = parseIntegerParam(req.query.id, 'id');
  const uniqueCode = normalizeStringParam(req.query.unique_code);

  const entries = await reCoilerService.listReCoilerEntries({ id, uniqueCode });
  res.status(StatusCodes.OK).json(buildResponse('Re-Coiler entries fetched', entries));
};

const getEntryByUniqueCode = async (req, res) => {
  const uniqueCode = normalizeStringParam(req.params.unique_code);
  if (!uniqueCode) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'unique_code path parameter is required');
  }

  const entry = await reCoilerService.getReCoilerByUniqueCode(uniqueCode);
  if (!entry) {
    throw new ApiError(StatusCodes.NOT_FOUND, `No Re-Coiler entry found for code ${uniqueCode}`);
  }

  res.status(StatusCodes.OK).json(buildResponse('Re-Coiler entry fetched', entry));
};

module.exports = { createEntry, listEntries, getEntryByUniqueCode };
