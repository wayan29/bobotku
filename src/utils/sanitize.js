'use strict';

const MAX_INPUT_LENGTH = 200;

/**
 * Safe extraction of text from Telegram message context.
 * Returns trimmed string, truncated to MAX_INPUT_LENGTH.
 * Guards against undefined, null, and non-string inputs.
 *
 * @param {object} ctx - Telegraf context
 * @param {number} [maxLen=MAX_INPUT_LENGTH]
 * @returns {string}
 */
function safeText(ctx, maxLen = MAX_INPUT_LENGTH) {
  const raw = ctx?.message?.text;
  return String(raw || '').trim().slice(0, maxLen);
}

/**
 * Validates that a string looks like a reasonable phone/account number.
 * Allows digits, optional leading +, dashes, dots, and | (TokoVoucher serverId separator).
 *
 * @param {string} value
 * @param {number} [maxLen=64]
 * @returns {string|null} cleaned value, or null if invalid
 */
function safeDestination(value, maxLen = 64) {
  if (!value) return null;
  const cleaned = String(value).trim().slice(0, maxLen);
  // Must contain at least one alphanumeric character
  if (!/[0-9A-Za-z]/.test(cleaned)) return null;
  // Only allow: digits, letters, +, -, ., |, space
  if (/[^0-9A-Za-z+\-.\s|]/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Validates that a value is a non-empty safe string for Mongo exact-match filter.
 * Rejects values that look like MongoDB operator injection ($, {, }).
 *
 * @param {string} value
 * @returns {string|null} cleaned value, or null if suspicious
 */
function safeFilterValue(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s || s.length > 200) return null;
  // Reject strings starting with $ or containing { }
  if (s.startsWith('$') || s.includes('{') || s.includes('}')) return null;
  return s;
}

module.exports = {
  safeText,
  safeDestination,
  safeFilterValue,
  MAX_INPUT_LENGTH,
};
