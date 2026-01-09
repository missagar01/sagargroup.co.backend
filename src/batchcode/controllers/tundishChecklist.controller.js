const { StatusCodes } = require('http-status-codes');
const tundishChecklistService = require('../services/tundishChecklist.service');
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
  const payload = await tundishChecklistService.createTundishChecklist(req.body);
  
  // Send WhatsApp notification
  const whatsappService = require('../utils/whatsapp.service');
  whatsappService.sendTundishNotification(payload).catch((error) => {
    console.error('Error sending WhatsApp notification for Tundish Checklist:', error);
  });
  console.log('Tundish checklist entry recorded', payload);
  
  res.status(StatusCodes.CREATED).json(buildResponse('Tundish checklist entry recorded', payload));
};

const listEntries = async (req, res) => {
  const id = parseIntegerParam(req.query.id, 'id');
  const uniqueCode = normalizeStringParam(req.query.unique_code);

  const entries = await tundishChecklistService.listTundishChecklists({ id, uniqueCode });
  res.status(StatusCodes.OK).json(buildResponse('Tundish checklist entries fetched', entries));
};

const getEntryByUniqueCode = async (req, res) => {
  const uniqueCode = normalizeStringParam(req.params.unique_code);
  if (!uniqueCode) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'unique_code path parameter is required');
  }

  const entry = await tundishChecklistService.getTundishChecklistByUniqueCode(uniqueCode);
  if (!entry) {
    throw new ApiError(StatusCodes.NOT_FOUND, `No Tundish checklist entry found for code ${uniqueCode}`);
  }

  res.status(StatusCodes.OK).json(buildResponse('Tundish checklist entry fetched', entry));
};



module.exports = { createEntry, listEntries, getEntryByUniqueCode };

