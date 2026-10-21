/**
 * src/middleware/validateName.js
 *
 * Server-side name validation middleware.
 *
 * This is the SECURITY boundary — frontend validation is UX only.
 *
 * Rules:
 * - `name` is optional (absent or empty string = skip DB insert)
 * - If present: Unicode letters and spaces only
 * - Trim and collapse internal whitespace before storing
 * - Max 40 Unicode code points (not bytes)
 * - Reject whitespace-only names
 * - Reject names with digits, punctuation, or emoji
 *
 * All validation failures return 400 with a generic message.
 * No sensitive details are exposed.
 */

'use strict';

// Unicode letter + space only — uses the Unicode `\p{L}` property
// \p{M} covers combining marks used in Indic scripts (Devanagari, Tamil, etc.)
const NAME_REGEX = /^[\p{L}\p{M}\s]+$/u;
const MAX_CODE_POINTS = 40;

/**
 * Validate and normalize the submitted name.
 * Returns { valid: true, normalizedName: string|null } or { valid: false, message: string }.
 */
function validateNameValue(raw) {
  // Missing or explicitly null → optional skip
  if (raw === undefined || raw === null) {
    return { valid: true, normalizedName: null };
  }

  if (typeof raw !== 'string') {
    return { valid: false, message: 'Name must be a string.' };
  }

  // Trim outer whitespace and collapse internal runs of whitespace
  const trimmed = raw.trim().replace(/\s+/g, ' ');

  // Empty after trimming → treat as "no name submitted"
  if (trimmed.length === 0) {
    return { valid: true, normalizedName: null };
  }

  // Count Unicode code points (handles multi-byte chars correctly)
  const codePoints = [...trimmed].length;
  if (codePoints > MAX_CODE_POINTS) {
    return { valid: false, message: `Name must be ${MAX_CODE_POINTS} characters or fewer.` };
  }

  if (!NAME_REGEX.test(trimmed)) {
    return { valid: false, message: 'Name may only contain letters and spaces.' };
  }

  return { valid: true, normalizedName: trimmed };
}

/**
 * Express middleware that validates req.body.name and attaches
 * req.normalizedName (string or null) for downstream handlers.
 */
function validateName(req, res, next) {
  const result = validateNameValue(req.body?.name);

  if (!result.valid) {
    return res.status(400).json({ message: result.message });
  }

  req.normalizedName = result.normalizedName;
  next();
}

export { validateName, validateNameValue };
