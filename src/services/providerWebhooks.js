const crypto = require('crypto');
const { upsertTransactionLog } = require('./upsertTransactionLog');

const MAX_BODY_BYTES = Number(process.env.WEBHOOK_MAX_BODY_BYTES || 64 * 1024);

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStatusEmoji(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'sukses') return '✅';
  if (normalized === 'gagal') return '❌';
  if (normalized === 'pending') return '⏳';
  return 'ℹ️';
}

function formatWebhookNotification(mapped) {
  const providerLabel = mapped.provider === 'digiflazz' ? 'Digiflazz' : 'TokoVoucher';
  const emoji = getStatusEmoji(mapped.status);
  const lines = [
    `${emoji} <b>WEBHOOK STATUS ${escapeHtml(providerLabel)}</b>`,
    '',
    `🆔 Ref ID: <code>${escapeHtml(mapped.id)}</code>`,
    `📊 Status: <b>${escapeHtml(mapped.status || 'Unknown')}</b>`,
  ];

  if (mapped.productName) lines.push(`📦 Produk: ${escapeHtml(mapped.productName)}`);
  if (mapped.originalCustomerNo) lines.push(`🎯 Tujuan: <code>${escapeHtml(mapped.originalCustomerNo)}</code>`);
  if (mapped.serialNumber) lines.push(`🔐 SN: <code>${escapeHtml(mapped.serialNumber)}</code>`);
  if (mapped.message) lines.push(`📝 Pesan: ${escapeHtml(mapped.message)}`);
  if (mapped.costPrice) lines.push(`💰 Harga Modal: Rp ${Number(mapped.costPrice).toLocaleString('id-ID')}`);

  lines.push('', `🕒 ${new Date().toLocaleString('id-ID', { timeZone: process.env.TZ || 'Asia/Makassar' })}`);
  return lines.join('\n');
}

function buildCopyKeyboard(mapped) {
  const buttons = [];
  if (mapped.id) {
    buttons.push([{ text: '📋 Salin Ref ID', copy_text: { text: String(mapped.id) } }]);
  }
  if (mapped.serialNumber) {
    buttons.push([{ text: '🔐 Salin SN', copy_text: { text: String(mapped.serialNumber) } }]);
  }
  return buttons.length ? { inline_keyboard: buttons } : undefined;
}

async function notifyWebhookStatus(bot, mapped) {
  const chatId = process.env.WEBHOOK_NOTIFY_CHAT_ID || process.env.OWNER_CHAT_ID;
  if (!bot || !chatId || process.env.WEBHOOK_NOTIFY_ENABLED === '0') return;

  try {
    await bot.telegram.sendMessage(chatId, formatWebhookNotification(mapped), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buildCopyKeyboard(mapped),
    });
  } catch (error) {
    console.warn('Webhook Telegram notify failed:', error?.message || error);
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeProviderStatus(status, rc) {
  const value = String(firstDefined(status, '')).toLowerCase();
  if (['sukses', 'success', 'berhasil', '1'].includes(value)) return 'Sukses';
  if (['gagal', 'failed', 'failure', '0'].includes(value)) return 'Gagal';
  if (['pending', 'process', 'processing'].includes(value)) return 'Pending';

  const rcValue = String(firstDefined(rc, '')).toUpperCase();
  if (rcValue === '00') return 'Sukses';
  if (rcValue && rcValue !== '03') return 'Gagal';
  return status || 'Pending';
}

function verifyDigiflazz(req, rawBody) {
  const secret = process.env.DIGIFLAZZ_WEBHOOK_SECRET || process.env.DIGIFLAZZ_CALLBACK_SECRET;
  if (!secret) return { ok: true, skipped: true };

  const header = req.headers['x-hub-signature'] || req.headers['x-digiflazz-signature'];
  if (!header) return { ok: false, reason: 'missing signature' };

  const provided = String(header).trim();
  const match = provided.match(/^(sha1|sha256|sha512)=([a-f0-9]+)$/i);
  const algo = match ? match[1].toLowerCase() : 'sha1';
  const providedHex = match ? match[2] : provided;
  const expectedHex = crypto.createHmac(algo, secret).update(rawBody).digest('hex');
  const expectedWithPrefix = `${algo}=${expectedHex}`;

  return {
    ok: safeEqual(provided, expectedWithPrefix) || safeEqual(providedHex, expectedHex),
    reason: 'bad signature',
  };
}

function verifyTokoVoucher(req, url, payload) {
  const token = process.env.TOKOVOUCHER_WEBHOOK_TOKEN || process.env.TOV_WEBHOOK_TOKEN;
  if (token) {
    const provided = req.headers['x-webhook-token'] || req.headers['x-tokovoucher-token'] || url.searchParams.get('token') || payload.token;
    if (!safeEqual(provided, token)) return { ok: false, reason: 'bad token' };
    return { ok: true };
  }

  // Official docs: X-TokoVoucher-Authorization = md5(MEMBER_CODE:SECRET:REF_ID).
  const secret = process.env.secret;
  const memberCode = process.env.member_code;
  const refId = firstDefined(payload.ref_id, payload.refid, payload.trx_id, payload.invoice);
  const signature = firstDefined(
    req.headers['x-tokovoucher-authorization'],
    payload.signature,
    url.searchParams.get('signature')
  );
  if (secret && memberCode && refId && signature) {
    const expected = crypto.createHash('md5').update(`${memberCode}:${secret}:${refId}`).digest('hex');
    return { ok: safeEqual(signature, expected), reason: 'bad signature' };
  }

  const requireAuth = process.env.REQUIRE_TOKOVOUCHER_WEBHOOK_AUTH === '1';
  return { ok: !requireAuth, skipped: true, reason: 'auth not configured' };
}

function mapDigiflazzPayload(payload) {
  const data = payload.data || payload;
  return {
    id: String(firstDefined(data.ref_id, data.refid, data.trx_id)),
    provider: 'digiflazz',
    user: 'provider_webhook',
    source: 'digiflazz_webhook',
    status: normalizeProviderStatus(data.status, data.rc),
    message: firstDefined(data.message, data.error_msg),
    serialNumber: firstDefined(data.sn, data.serial_number),
    productName: firstDefined(data.product_name, data.buyer_sku_code),
    buyerSkuCode: firstDefined(data.buyer_sku_code, data.sku),
    originalCustomerNo: firstDefined(data.customer_no, data.customer_number),
    providerTransactionId: firstDefined(data.trx_id, data.id),
    costPrice: firstDefined(data.price, data.cost_price),
  };
}

function mapTokoVoucherPayload(payload) {
  const data = payload.data || payload;
  return {
    id: String(firstDefined(data.ref_id, data.refid, data.trx_id, data.invoice, data.reff_id)),
    provider: 'tokovoucher',
    user: 'provider_webhook',
    source: 'tokovoucher_webhook',
    status: normalizeProviderStatus(firstDefined(data.status, data.status_trx), data.rc),
    message: firstDefined(data.message, data.keterangan, data.note),
    serialNumber: firstDefined(data.sn, data.serial_number, data.voucher),
    productName: firstDefined(data.produk, data.product_name, data.nama_produk, data.kode_produk),
    buyerSkuCode: firstDefined(data.kode_produk, data.code, data.product_code),
    originalCustomerNo: firstDefined(data.tujuan, data.customer_no, data.nomor, data.no_tujuan),
    providerTransactionId: firstDefined(data.trx_id, data.id),
    costPrice: firstDefined(data.price, data.harga),
  };
}

async function handleProviderWebhook(req, res, options = {}) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '');
  const isDigi = pathname === (process.env.DIGIFLAZZ_WEBHOOK_PATH || '/webhooks/digiflazz');
  const isTov = pathname === (process.env.TOKOVOUCHER_WEBHOOK_PATH || '/webhooks/tokovoucher');
  if (!isDigi && !isTov) return false;

  if (req.method !== 'POST' && !(isTov && req.method === 'GET')) {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  try {
    const rawBody = req.method === 'POST' ? await readRawBody(req) : Buffer.alloc(0);
    const bodyPayload = rawBody.length ? JSON.parse(rawBody.toString('utf8') || '{}') : {};
    const queryPayload = Object.fromEntries(url.searchParams.entries());
    const payload = { ...queryPayload, ...bodyPayload };

    const auth = isDigi ? verifyDigiflazz(req, rawBody) : verifyTokoVoucher(req, url, payload);
    if (!auth.ok) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' });
      return true;
    }

    if (isDigi && String(req.headers['x-digiflazz-event'] || '').toLowerCase() === 'ping') {
      sendJson(res, 200, { ok: true, ping: true });
      return true;
    }

    const mapped = isDigi ? mapDigiflazzPayload(payload) : mapTokoVoucherPayload(payload);
    if (!mapped.id || mapped.id === 'undefined') {
      sendJson(res, 400, { ok: false, error: 'missing_ref_id' });
      return true;
    }

    await upsertTransactionLog(mapped);
    await notifyWebhookStatus(options.bot, mapped);
    sendJson(res, 200, { ok: true, ref_id: mapped.id });
  } catch (error) {
    const statusCode = error?.statusCode || (error instanceof SyntaxError ? 400 : 500);
    console.warn('Provider webhook error:', error?.message || error);
    sendJson(res, statusCode, { ok: false, error: statusCode === 400 ? 'invalid_json' : 'internal_error' });
  }
  return true;
}

module.exports = { handleProviderWebhook };
