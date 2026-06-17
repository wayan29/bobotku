// Simple receipt image generator using pureimage (no native deps)
const PImage = require('pureimage');
const { PassThrough } = require('stream');
const path = require('path');

// Try to register a common system font as "Source Sans" to avoid warnings
try {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    path.resolve(__dirname, '../../assets/DejaVuSans.ttf'),
  ];
  for (const p of candidates) {
    try {
      const f = PImage.registerFont(p, 'Source Sans');
      f.loadSync();
      break;
    } catch {}
  }
} catch {}

function drawTextLine(ctx, text, x, y, color = '#111', font = '18pt "Source Sans"') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(text, x, y);
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
  const width = 820;
  let height = 760;
  if (serialNumber) height += 60;

  const img = PImage.make(width, height);
  const ctx = img.getContext('2d');

  // palette
  const blue = '#2563eb';
  const green = '#10b981';
  const muted = '#6b7280';
  const line = '#e5e7eb';
  const headerBg = '#f5f7fb';
  const boxBg = '#eef2f7';
  const snBg = '#e8efff';

  // helpers
  const rupiah = (n) => new Intl.NumberFormat('id-ID').format(Number(n || 0));
  const centerX = (text, font, y, color = '#111') => {
    ctx.font = font; ctx.fillStyle = color;
    const w = ctx.measureText(text).width;
    ctx.fillText(text, Math.round((width - w) / 2), y);
  };
  const drawRoundRect = (x, y, w, h, r, color) => {
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
  };

  // background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // header area
  ctx.fillStyle = headerBg;
  ctx.fillRect(0, 0, width, 150);

  // success circle with check
  const cx = width / 2; const cy = 55; const radius = 32;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = '#dcfce7';
  ctx.fill();
  centerX('✓', '28pt "Source Sans"', cy + 10, green);

  // Title + Receipt ID
  centerX('Transaction Successful', '26pt "Source Sans"', 112, blue);
  // Format ref: DFxxxxxxxxxxxxxxNNN => DF-YYYYMMDDHHMMSS-NNN
  let displayRef = refId;
  const m = /^([A-Z]{2})(\d{14})(\d{3})$/.exec(String(refId || ''));
  if (m) displayRef = `${m[1]}-${m[2]}-${m[3]}`;
  centerX(`Receipt ID: ${displayRef}`, '16pt "Source Sans"', 138, muted);

  // Product block
  let y = 195;
  ctx.font = '22pt "Source Sans"'; ctx.fillStyle = '#111';
  ctx.fillText(`${productName}`, 32, y);
  y += 34;
  ctx.font = '16pt "Source Sans"'; ctx.fillStyle = muted;
  ctx.fillText(`${customerNo} (${brand || provider})`, 32, y);
  y += 24;

  // separator line
  ctx.fillStyle = line; ctx.fillRect(32, y + 12, width - 64, 2);
  y += 44;

  // Two-column details
  const leftX = 32, rightX = width - 280; // right column aligned

  // Status
  ctx.font = '16pt "Source Sans"'; ctx.fillStyle = '#374151';
  ctx.fillText('Status:', leftX, y);
  ctx.fillStyle = green; ctx.font = '18pt "Source Sans"';
  ctx.fillText(status, rightX, y);
  y += 34;

  // Date & Time
  ctx.font = '16pt "Source Sans"'; ctx.fillStyle = '#374151';
  ctx.fillText('Date & Time:', leftX, y);
  ctx.fillStyle = '#111';
  ctx.fillText(timeText, rightX, y);
  y += 26;
  ctx.fillStyle = '#111'; ctx.fillText(tzLabel, rightX, y);
  y += 30;

  // Category / Brand
  ctx.fillStyle = '#374151'; ctx.font = '16pt "Source Sans"';
  ctx.fillText('Category:', leftX, y);
  ctx.fillStyle = '#111'; ctx.fillText(category || '-', rightX, y);
  y += 28;
  ctx.fillStyle = '#374151'; ctx.fillText('Brand:', leftX, y);
  ctx.fillStyle = '#111'; ctx.fillText(brand || provider || '-', rightX, y);
  y += 36;

  // Total Payment box on right
  ctx.fillStyle = '#374151'; ctx.font = '16pt "Source Sans"';
  ctx.fillText('Total Payment:', leftX, y + 28);
  drawRoundRect(width - 260, y, 220, 56, 10, '#ffffff');
  drawRoundRect(width - 260, y, 220, 56, 10, boxBg); // subtle bg
  ctx.font = '20pt "Source Sans"'; ctx.fillStyle = blue;
  const amount = rupiah(sellingPrice);
  const aw = ctx.measureText(amount).width;
  ctx.fillText(amount, width - 40 - aw, y + 36);
  y += 86;

  // SN block
  if (serialNumber) {
    drawRoundRect(32, y, width - 64, 64, 12, snBg);
    ctx.font = '16pt "Source Sans"'; ctx.fillStyle = muted;
    ctx.fillText('Serial Number (SN) / Token:', 40, y - 10);
    ctx.font = '22pt "Source Sans"'; ctx.fillStyle = blue;
    const snw = ctx.measureText(serialNumber).width;
    ctx.fillText(serialNumber, Math.max(40, Math.round((width - snw) / 2)), y + 40);
  }

  // footer note
  ctx.fillStyle = muted; ctx.font = '14pt "Source Sans"';
  ctx.fillText('Terima kasih telah bertransaksi.', 32, height - 26);

  // encode to PNG buffer
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
