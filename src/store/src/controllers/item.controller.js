import * as itemService from "../services/item.service.js";

/**
 * Controller to get active store indent items.
 * Handles request and response logic.
 */
export async function getItems(req, res) {
  try {
    const result = await itemService.getStoreIndentItems();

    if (result.success) {
      res.status(200).json(result);
    } else {
      // If the service handled the error and returned a specific message
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error('[getItems] Unhandled error:', err);
    res.status(500).json({ success: false, error: "An internal server error occurred." });
  }
}

/**
 * Controller to get unique store indent item categories.
 */

