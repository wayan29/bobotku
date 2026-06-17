'use strict';

/**
 * Simple in-memory rate limiter per chat ID.
 * Use for commands that hit external APIs (transaksi, status check, reload).
 */

// Map<chatId, Map<bucketKey, nextAllowedAt>>
const _buckets = new Map();

const BUCKET_DEFAULTS = {
  // command / key → cooldown ms
  'tov_status':   3000,   // 3s
  'dg_status':    3000,
  'struk':        3000,
  'transaksi':    8000,   // 8s — creation involves money
  'reloaddg':     30000,  // 30s
};

/**
 * Check + mark rate limit for a chat+bucket.
 * Returns null if allowed, or an object { retryAfterMs } if blocked.
 *
 * @param {number|string} chatId
 * @param {string} bucketKey
 * @param {number} [cooldownMs] — override; falls back to BUCKET_DEFAULTS or 5 s
 * @returns {{ retryAfterMs: number } | null}
 */
function checkLimit(chatId, bucketKey, cooldownMs) {
  const now = Date.now();
  const cooldown = cooldownMs || BUCKET_DEFAULTS[bucketKey] || 5000;
  const key = bucketKey;

  if (!_buckets.has(chatId)) _buckets.set(chatId, new Map());
  const chatBuckets = _buckets.get(chatId);

  const nextAllowed = chatBuckets.get(key) || 0;
  if (now < nextAllowed) {
    return { retryAfterMs: nextAllowed - now };
  }

  chatBuckets.set(key, now + cooldown);
  return null;
}

/**
 * Format remaining milliseconds into human-readable seconds.
 * @param {number} ms
 * @returns {string}
 */
function formatRetryAfter(ms) {
  const secs = Math.ceil(ms / 1000);
  return `${secs} detik`;
}

module.exports = { checkLimit, formatRetryAfter };
