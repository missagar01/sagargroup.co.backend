import * as chatbotService from "../services/chatbotService.js";

/**
 * Endpoint to search items in ITEM_MAST
 */
export const searchItems = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(200).json([]);
    }
    const items = await chatbotService.searchItems(q.trim());
    res.status(200).json(items);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get stock for an item
 */
export const getItemStock = async (req, res, next) => {
  try {
    const { itemCode } = req.params;
    if (!itemCode) {
      return res.status(400).json({ error: 'Item code is required.' });
    }
    const stock = await chatbotService.getItemStock(itemCode.trim());
    res.status(200).json({ stock });
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get all indent series options
 */
export const getIndentSeries = async (req, res, next) => {
  try {
    const series = await chatbotService.getIndentSeries();
    res.status(200).json(series);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get list of distinct departments
 */
export const getDepartments = async (req, res, next) => {
  try {
    const depts = await chatbotService.getDepartments();
    res.status(200).json(depts);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get list of cost codes
 */
export const getCostCodes = async (req, res, next) => {
  try {
    const costCodes = await chatbotService.getCostCodes();
    res.status(200).json(costCodes);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get list of employees
 */
export const getEmployees = async (req, res, next) => {
  try {
    const emps = await chatbotService.getEmployees();
    res.status(200).json(emps);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get list of makes
 */
export const getMakes = async (req, res, next) => {
  try {
    const makes = await chatbotService.getMakes();
    res.status(200).json(makes);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to raise a new indent in database
 */
export const createIndent = async (req, res, next) => {
  try {
    const { itemCode, qty, deptCode, series, specs, purpose, dueDate, make, userCode, costCode, empName, divCode } = req.body;

    const isValidText = (str) => {
      if (!str) return false;
      const trimmed = str.trim();
      const matches = trimmed.match(/[a-zA-Z0-9\u0900-\u097F]/g);
      return matches && matches.length >= 2;
    };

    // Basic Validations
    if (!itemCode) return res.status(400).json({ error: 'itemCode is required.' });
    if (!qty || isNaN(qty) || Number(qty) <= 0) return res.status(400).json({ error: 'Valid positive qty is required.' });
    if (!deptCode) return res.status(400).json({ error: 'deptCode is required.' });
    if (!series) return res.status(400).json({ error: 'series code is required.' });
    if (!make) return res.status(400).json({ error: 'make (makeCode) is required.' });
    if (!isValidText(specs)) return res.status(400).json({ error: 'Valid specs (at least 2 letters/numbers, no dots/symbols) are required.' });
    if (!isValidText(purpose)) return res.status(400).json({ error: 'Valid purpose (at least 2 letters/numbers, no dots/symbols) is required.' });
    if (!costCode) return res.status(400).json({ error: 'costCode is required.' });
    
    // Custom Validation for series I5 requiring division code
    if (series === 'I5' && !divCode) {
      return res.status(400).json({ error: 'divCode is required for series I5.' });
    }

    const result = await chatbotService.createIndent({
      itemCode: itemCode.trim(),
      qty: Number(qty),
      deptCode: deptCode.trim(),
      series: series.trim(),
      specs: specs.trim(),
      purpose: purpose.trim(),
      dueDate,
      make: make ? make.trim() : null,
      userCode: userCode ? userCode.trim() : 'SR002',
      costCode: costCode.trim(),
      empName: empName ? empName.trim() : '',
      divCode: divCode ? divCode.trim() : null
    });

    res.status(200).json({
      success: true,
      vrNo: result.vrNo,
      message: `Indent ${result.vrNo} raised successfully in division ${result.divCode || result.entityCode}!`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
