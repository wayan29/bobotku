'use strict';

const { checkLimit, formatRetryAfter } = require('../utils/rateLimiter');

const COMMAND_LIMITS = [
  { pattern: /^\/(?:tov|tovcheck)\b/i, bucket: 'tov_status', cooldownMs: 3000 },
  { pattern: /^\/(?:dg|digi|digicheck)\b/i, bucket: 'dg_status', cooldownMs: 3000 },
  { pattern: /^\/struk\b/i, bucket: 'struk', cooldownMs: 3000 },
  { pattern: /^\/reloaddg\b/i, bucket: 'reloaddg', cooldownMs: 30000 },
];

function rateLimitCommands(ctx, next) {
  const text = ctx?.message?.text;
  if (!text) return next();

  const matched = COMMAND_LIMITS.find((item) => item.pattern.test(text));
  if (!matched) return next();

  const chatId = ctx.chat?.id || ctx.from?.id || 'unknown';
  const limited = checkLimit(chatId, matched.bucket, matched.cooldownMs);
  if (!limited) return next();

  return ctx.reply(
    `⏳ Terlalu cepat. Coba lagi dalam ${formatRetryAfter(limited.retryAfterMs)}.`
  );
}

module.exports = rateLimitCommands;
