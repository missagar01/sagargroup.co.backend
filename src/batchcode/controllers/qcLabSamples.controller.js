const { StatusCodes } = require('http-status-codes');
const qcLabSamplesService = require('../services/qcLabSamples.service');
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

const createSample = async (req, res) => {
  const payload = await qcLabSamplesService.createSample(req.body);
  
  // Send WhatsApp notification
  const whatsappService = require('../utils/whatsapp.service');
  whatsappService.sendQcLabNotification(payload).catch((error) => {
    console.error('Error sending WhatsApp notification for QC Lab Sample:', error);
  });
  
  res.status(StatusCodes.CREATED).json(buildResponse('QC lab sample recorded', payload));
};

const getSampleByUniqueCode = async (req, res) => {
  const uniqueCode = normalizeStringParam(req.params.unique_code);
  if (!uniqueCode) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'unique_code path parameter is required');
  }

  const sample = await qcLabSamplesService.getSampleByUniqueCode(uniqueCode);
  if (!sample) {
    throw new ApiError(StatusCodes.NOT_FOUND, `No QC lab sample found for code ${uniqueCode}`);
  }

  res.status(StatusCodes.OK).json(buildResponse('QC lab sample fetched', sample));
};

const listSamples = async (req, res) => {
  const id = parseIntegerParam(req.query.id, 'id');
  const uniqueCode = normalizeStringParam(req.query.unique_code);

  const samples = await qcLabSamplesService.listSamples({ id, uniqueCode });
  res.status(StatusCodes.OK).json(buildResponse('QC lab samples fetched', samples));
};

module.exports = { createSample, listSamples, getSampleByUniqueCode };
