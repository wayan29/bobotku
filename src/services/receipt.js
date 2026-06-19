// Mobile-friendly receipt image generator using pureimage (no native deps)
const PImage = require('pureimage');
const { PassThrough } = require('stream');
const path = require('path');

// Register common system fonts once. PureImage does not reliably support CSS font-weight,
// so use separate font family names for regular/bold/mono where available.
try {
  const fonts = [
    { name: 'ReceiptSans', paths: [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      path.resolve(__dirname, '../../assets/DejaVuSans.ttf'),
    ] },
    { name: 'ReceiptSansBold', paths: [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
      path.resolve(__dirname, '../../assets/DejaVuSans-Bold.ttf'),
    ] },
    { name: 'ReceiptMono', paths: [
      '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
      path.resolve(__dirname, '../../assets/DejaVuSansMono.ttf'),
    ] },
  ];

  for (const font of fonts) {
    for (const p of font.paths) {
      try {
        const f = PImage.registerFont(p, font.name);
        f.loadSync();
        break;
      } catch {}
    }
  }
} catch {}

const COLORS = {
  page: '#f1f5f9',
  card: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
  primary: '#2563eb',
  primarySoft: '#eff6ff',
  primaryBorder: '#bfdbfe',
  success: '#16a34a',
  successSoft: '#dcfce7',
  warning: '#d97706',
  warningSoft: '#fef3c7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  snBg: '#f8fafc',
};

const FONT = {
  title: '28pt "ReceiptSansBold"',
  subtitle: '14pt "ReceiptSans"',
  label: '13pt "ReceiptSans"',
  value: '18pt "ReceiptSans"',
  valueBold: '18pt "ReceiptSansBold"',
  small: '12pt "ReceiptSans"',
  amount: '28pt "ReceiptSansBold"',
  sn: '17pt "ReceiptMono"',
};

function safe(value, fallback = '-') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function formatRef(refId) {
  const raw = safe(refId);
  const m = /^([A-Z]{2})(\d{14})(\d{3})$/.exec(raw);
  if (!m) return raw;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function formatRupiah(value) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number(value || 0))}`;
}

function getStatusPalette(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('pending')) return { color: COLORS.warning, soft: COLORS.warningSoft, label: 'PENDING' };
  if (s.includes('gagal') || s.includes('failed')) return { color: COLORS.danger, soft: COLORS.dangerSoft, label: 'GAGAL' };
  return { color: COLORS.success, soft: COLORS.successSoft, label: 'SUKSES' };
}

function drawRoundRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawCentered(ctx, text, y, font, color, width) {
  ctx.font = font;
  ctx.fillStyle = color;
  const w = ctx.measureText(text).width;
  ctx.fillText(text, Math.round((width - w) / 2), y);
}

function drawRight(ctx, text, rightX, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  const w = ctx.measureText(text).width;
  ctx.fillText(text, rightX - w, y);
}

function wrapText(ctx, value, maxWidth, font, maxLines = 0) {
  ctx.font = font;
  const text = safe(value);
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';

  const pushLongWord = (word) => {
    let chunk = '';
    for (const ch of word) {
      const test = chunk + ch;
      if (!chunk || ctx.measureText(test).width <= maxWidth) {
        chunk = test;
      } else {
        lines.push(chunk);
        chunk = ch;
      }
    }
    if (chunk) line = chunk;
  };

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = '';
      if (ctx.measureText(word).width > maxWidth) pushLongWord(word);
      else line = word;
    }
  }
  if (line) lines.push(line);

  if (maxLines > 0 && lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    let last = clipped[clipped.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    clipped[clipped.length - 1] = `${last}…`;
    return clipped;
  }
  return lines;
}

function drawWrapped(ctx, lines, x, y, lineHeight, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function buildLayout(ctx, payload, width) {
  const margin = 26;
  const pad = 34;
  const cardX = margin;
  const cardW = width - margin * 2;
  const innerX = cardX + pad;
  const innerW = cardW - pad * 2;

  const productLines = wrapText(ctx, payload.productName, innerW, FONT.valueBold, 3);
  const customerLines = wrapText(ctx, payload.customerNo, innerW, FONT.value, 2);
  const categoryBrand = `${safe(payload.category)} / ${safe(payload.brand || payload.provider)}`;
  const categoryLines = wrapText(ctx, categoryBrand, innerW, FONT.value, 2);
  const timeLines = wrapText(ctx, `${safe(payload.timeText)} ${safe(payload.tzLabel, '')}`.trim(), innerW, FONT.value, 2);
  const snText = safe(payload.serialNumber, '');
  const snLines = snText ? wrapText(ctx, snText, innerW - 34, FONT.sn, 8) : [];

  const fieldHeight = (lines) => 24 + lines.length * 27 + 14;
  const headerH = 174;
  const productH = 24 + productLines.length * 29 + 16;
  const fieldsH = fieldHeight(customerLines) + fieldHeight(categoryLines) + fieldHeight(timeLines);
  const totalH = 96;
  const snH = snLines.length ? 52 + snLines.length * 27 + 44 : 0;
  const footerH = 280;
  const cardH = headerH + productH + fieldsH + totalH + snH + footerH;
  const height = cardH + margin * 2;

  return {
    width,
    height,
    margin,
    cardX,
    cardY: margin,
    cardW,
    cardH,
    innerX,
    innerW,
    pad,
    productLines,
    customerLines,
    categoryLines,
    timeLines,
    snLines,
  };
}

function drawDivider(ctx, x, y, w) {
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(x, y, w, 1);
}

function drawField(ctx, { label, lines, x, y, width }) {
  ctx.font = FONT.label;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(label.toUpperCase(), x, y);
  y += 26;
  y = drawWrapped(ctx, lines, x, y, 27, FONT.value, COLORS.text);
  y += 12;
  drawDivider(ctx, x, y, width);
  return y + 24;
}

function drawStatusIcon(ctx, cx, cy, palette) {
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = palette.soft;
  ctx.fill();

  ctx.strokeStyle = palette.color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (palette.label === 'GAGAL') {
    ctx.moveTo(cx - 10, cy - 10);
    ctx.lineTo(cx + 10, cy + 10);
    ctx.moveTo(cx + 10, cy - 10);
    ctx.lineTo(cx - 10, cy + 10);
  } else if (palette.label === 'PENDING') {
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 2);
    ctx.lineTo(cx + 10, cy + 10);
  } else {
    ctx.moveTo(cx - 13, cy + 1);
    ctx.lineTo(cx - 3, cy + 11);
    ctx.lineTo(cx + 15, cy - 12);
  }
  ctx.stroke();
}

async function createReceiptImage({
  provider = '-',
  status = 'Sukses',
  refId = '-',
  timeText = '-',
  tzLabel = 'WITA',
  productName = '-',
  customerNo = '-',
  category = '-',
  brand = '-',
  serialNumber = '',
  sellingPrice = 0,
}) {
  const width = 720;
  const measure = PImage.make(width, 100).getContext('2d');
  const payload = { provider, status, refId, timeText, tzLabel, productName, customerNo, category, brand, serialNumber, sellingPrice };
  const layout = buildLayout(measure, payload, width);
  const palette = getStatusPalette(status);

  const img = PImage.make(layout.width, layout.height);
  const ctx = img.getContext('2d');

  // page + main card
  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawRoundRect(ctx, layout.cardX, layout.cardY, layout.cardW, layout.cardH, 24, COLORS.card);
  drawRoundRect(ctx, layout.cardX, layout.cardY, layout.cardW, 8, 4, palette.color);

  let y = layout.cardY + 34;
  drawStatusIcon(ctx, layout.width / 2, y + 32, palette);
  y += 86;

  drawCentered(ctx, 'STRUK TRANSAKSI', y, FONT.title, COLORS.text, layout.width);
  y += 30;
  drawCentered(ctx, `Ref: ${formatRef(refId)}`, y, FONT.subtitle, COLORS.muted, layout.width);
  y += 28;
  drawDivider(ctx, layout.innerX, y, layout.innerW);
  y += 34;

  // product block
  ctx.font = FONT.label;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('PRODUK', layout.innerX, y);
  y += 28;
  y = drawWrapped(ctx, layout.productLines, layout.innerX, y, 29, FONT.valueBold, COLORS.text);
  y += 14;
  drawDivider(ctx, layout.innerX, y, layout.innerW);
  y += 24;

  y = drawField(ctx, { label: 'Nomor / ID Tujuan', lines: layout.customerLines, x: layout.innerX, y, width: layout.innerW });
  y = drawField(ctx, { label: 'Kategori / Brand', lines: layout.categoryLines, x: layout.innerX, y, width: layout.innerW });
  y = drawField(ctx, { label: 'Waktu', lines: layout.timeLines, x: layout.innerX, y, width: layout.innerW });

  // status and total payment block
  drawRoundRect(ctx, layout.innerX, y, layout.innerW, 72, 16, COLORS.primarySoft);
  ctx.font = FONT.label;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('TOTAL BAYAR', layout.innerX + 20, y + 27);
  ctx.font = FONT.small;
  ctx.fillStyle = palette.color;
  ctx.fillText(palette.label, layout.innerX + 20, y + 51);
  drawRight(ctx, formatRupiah(sellingPrice), layout.innerX + layout.innerW - 20, y + 47, FONT.amount, COLORS.primary);
  y += 104;

  if (layout.snLines.length) {
    drawRoundRect(ctx, layout.innerX, y, layout.innerW, 52 + layout.snLines.length * 27 + 40, 16, COLORS.snBg);
    ctx.font = FONT.label;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('SN / TOKEN', layout.innerX + 18, y + 30);
    y = drawWrapped(ctx, layout.snLines, layout.innerX + 18, y + 64, 27, FONT.sn, COLORS.primary);
    y += 44;
  }

  // footer
  drawDivider(ctx, layout.innerX, y, layout.innerW);
  y += 30;
  drawCentered(ctx, 'Terima kasih telah bertransaksi.', y, FONT.subtitle, COLORS.text, layout.width);
  y += 24;
  drawCentered(ctx, 'Simpan struk ini sebagai bukti transaksi yang sah.', y, FONT.small, COLORS.muted, layout.width);

  const stream = new PassThrough();
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    PImage.encodePNGToStream(img, stream).catch(reject);
  });
}

module.exports = { createReceiptImage };
