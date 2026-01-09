const { StatusCodes } = require('http-status-codes');
const pipeMillService = require('../services/pipeMill.service');
const { buildResponse } = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const reCoilerRepository = require('../repositories/reCoiler.repository');

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
  const payload = await pipeMillService.createPipeMill(req.body);
  
  // Send WhatsApp notification
  const whatsappService = require('../utils/whatsapp.service');
  
  // Fetch ReCoiler data for the message
  if (payload.recoiler_short_code) {
    const reCoilerRows = await reCoilerRepository.findReCoilerEntries({
      uniqueCode: payload.recoiler_short_code
    });
    const reCoilerData = reCoilerRows.length > 0 ? reCoilerRows[0] : null;
    
    whatsappService.sendPipeMillNotification(payload, reCoilerData).catch((error) => {
      console.error('Error sending WhatsApp notification for Pipe Mill:', error);
    });
  }
  
  res.status(StatusCodes.CREATED).json(buildResponse('Pipe Mill entry recorded', payload));
};

const listEntries = async (req, res) => {
  const id = parseIntegerParam(req.query.id, 'id');
  const uniqueCode = normalizeStringParam(req.query.unique_code);

  const entries = await pipeMillService.listPipeMillEntries({ id, uniqueCode });
  res.status(StatusCodes.OK).json(buildResponse('Pipe Mill entries fetched', entries));
};

const getEntryByUniqueCode = async (req, res) => {
  const uniqueCode = normalizeStringParam(req.params.unique_code);
  if (!uniqueCode) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'unique_code path parameter is required');
  }

  const entry = await pipeMillService.getPipeMillByUniqueCode(uniqueCode);
  if (!entry) {
    throw new ApiError(StatusCodes.NOT_FOUND, `No Pipe Mill entry found for code ${uniqueCode}`);
  }

  res.status(StatusCodes.OK).json(buildResponse('Pipe Mill entry fetched', entry));
};

module.exports = { createEntry, listEntries, getEntryByUniqueCode };
