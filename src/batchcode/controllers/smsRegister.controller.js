const { StatusCodes } = require('http-status-codes');
const smsRegisterService = require('../services/smsRegister.service');
const { buildResponse } = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');

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
  const payload = await smsRegisterService.createSmsRegister(req.body);
  
  // Send WhatsApp notification
  const whatsappService = require('../utils/whatsapp.service');
  whatsappService.sendSmsRegisterNotification(payload).catch((error) => {
    console.error('Error sending WhatsApp notification for SMS Register:', error);
  });
  
  res.status(StatusCodes.CREATED).json(buildResponse('SMS register entry recorded', payload));
};

const listEntries = async (req, res) => {
  const id = parseIntegerParam(req.query.id, 'id');
  const uniqueCode = normalizeStringParam(req.query.unique_code);

  const entries = await smsRegisterService.listSmsRegisters({ id, uniqueCode });
  res.status(StatusCodes.OK).json(buildResponse('SMS register entries fetched', entries));
};

module.exports = { createEntry, listEntries };
