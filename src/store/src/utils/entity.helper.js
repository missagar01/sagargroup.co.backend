// Shared helper for resolving the ERP entity/company code used by store reports.
// Reports historically only exposed "SR"; users can now switch to "AL" or "PA".

export const ALLOWED_ENTITIES = ["SR", "AL", "PA"];
export const DEFAULT_ENTITY = "SR";

/**
 * Normalises an incoming entity value (query string, etc.) to a safe, allowed
 * entity code. Falls back to the default entity when the value is missing or
 * not recognised, so it is always safe to bind into a SQL query.
 * @param {unknown} value
 * @returns {string}
 */
export function resolveEntity(value) {
  if (typeof value === "string") {
    const upper = value.trim().toUpperCase();
    if (ALLOWED_ENTITIES.includes(upper)) {
      return upper;
    }
  }
  return DEFAULT_ENTITY;
}
