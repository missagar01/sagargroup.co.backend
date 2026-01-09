const { StatusCodes } = require('http-status-codes');
const hotCoilService = require('../services/hotCoil.service');
const { buildResponse } = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const smsRegisterRepository = require('../repositories/smsRegister.repository');

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
  const payload = await hotCoilService.createHotCoil(req.body);
  
  // Send WhatsApp notification
  const whatsappService = require('../utils/whatsapp.service');
  
  // Fetch SMS register data for the message
  if (payload.sms_short_code) {
    const smsRegisterRows = await smsRegisterRepository.findSmsRegisters({
      uniqueCode: payload.sms_short_code
    });
    const smsData = smsRegisterRows.length > 0 ? smsRegisterRows[0] : null;
    
    whatsappService.sendHotCoilNotification(payload, smsData).catch((error) => {
      console.error('Error sending WhatsApp notification for Hot Coil:', error);
    });
  }
  
  res.status(StatusCodes.CREATED).json(buildResponse('Hot coil entry recorded', payload));
};

const listEntries = async (req, res) => {
  const id = parseIntegerParam(req.query.id, 'id');
  const uniqueCode = normalizeStringParam(req.query.unique_code);

  const entries = await hotCoilService.listHotCoilEntries({ id, uniqueCode });
  res.status(StatusCodes.OK).json(buildResponse('Hot coil entries fetched', entries));
};

const getEntryByUniqueCode = async (req, res) => {
  const uniqueCode = normalizeStringParam(req.params.unique_code);
  if (!uniqueCode) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'unique_code path parameter is required');
  }

  const entry = await hotCoilService.getHotCoilByUniqueCode(uniqueCode);
  if (!entry) {
    throw new ApiError(StatusCodes.NOT_FOUND, `No hot coil entry found for code ${uniqueCode}`);
  }

  res.status(StatusCodes.OK).json(buildResponse('Hot coil entry fetched', entry));
};

module.exports = { createEntry, listEntries, getEntryByUniqueCode };
