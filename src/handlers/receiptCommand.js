const axios = require('axios');
const crypto = require('crypto');

const DigiFlazz = require('../models/trxdigi');
const TokoV = require('../models/tov');
const TransactionLog = require('../models/transactionLog');
const { createReceiptImage } = require('../services/receipt');

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toNumeric = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
};

const formatCurrency = (value) => toNumeric(value).toLocaleString('id-ID');

const normalizeStatus = (rawStatus) => {
    const status = (rawStatus || '').toString().toLowerCase();
    if (status === 'sukses') return 'Sukses';
    if (status === 'pending') return 'Pending';
    if (status === 'gagal' || status === 'failed') return 'Gagal';
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
};

function createReceiptCommandMiddleware({ checkTovStatus }) {
    return async (ctx, next) => {
        const text = ctx.message?.text || '';
        if (typeof text === 'string' && /^\/struk(\s+|$)/i.test(text)) {
            try {
                const parts = text.trim().split(/\s+/);
                if (parts.length === 1) {
                    const logs = await TransactionLog.find().sort({ timestamp: -1 }).limit(15);
                    if (logs.length === 0) return ctx.replyWithHTML('❌ <b>Tidak ada transaksi</b>');
                    let msg = '🧾 <b>REF ID TERAKHIR</b>\n\n';
                    logs.forEach((log) => {
                        const statusEmoji = log.status === 'Sukses' ? '✅' : log.status === 'Pending' ? '⏳' : log.status === 'Gagal' ? '❌' : '❓';
                        msg += `${statusEmoji} <code>${log.id}</code> — ${log.provider} — ${new Date(log.timestamp).toLocaleString('id-ID')}\n`;
                    });
                    msg += '\nKetik /struk &lt;ref_id&gt; untuk cetak struk';
                    await ctx.replyWithHTML(msg);
                    return;
                }

                const refId = parts[1];
                let tlog = await TransactionLog.findOne({ id: refId });
                let provider = tlog?.provider || (refId.startsWith('DF') ? 'digiflazz' : refId.startsWith('TV') ? 'tokovoucher' : null);

                if (!tlog) {
                    const fallback = await DigiFlazz.findOne({ ref_id: refId }) || await TokoV.findOne({ ref_id: refId });
                    if (!fallback) {
                        await ctx.replyWithHTML(`❌ <b>Ref ID tidak ditemukan:</b> <code>${refId}</code>`);
                        return;
                    }
                    provider = fallback.buyer_sku_code ? 'digiflazz' : 'tokovoucher';
                }

                let status = String(tlog?.status || '').toLowerCase();
                if (status === 'pending') {
                    await ctx.replyWithHTML(`⏳ <b>Mengecek status transaksi...</b>\n<code>${refId}</code>`);
                    try {
                        if (provider === 'tokovoucher') {
                            const res = await checkTovStatus(refId);
                            if (res && typeof res.status === 'string') {
                                await TransactionLog.updateOne(
                                    { id: refId },
                                    {
                                        $set: {
                                            status: normalizeStatus(res.status),
                                            serialNumber: res.sn || null,
                                            costPrice: typeof res.price === 'number' ? res.price : tlog?.costPrice,
                                            sellingPrice: tlog?.sellingPrice ?? (typeof res.price === 'number' ? res.price : undefined),
                                            details: `${res.ref_id} (${res.message || '-'})`,
                                            providerTransactionId: res.trx_id || null,
                                            timestamp: new Date(),
                                        }
                                    }
                                );
                                try {
                                    await TokoV.findOneAndUpdate({ ref_id: refId }, { status: res.status, sn: res.sn }, { new: true });
                                } catch {}
                            }
                        } else if (provider === 'digiflazz') {
                            if (tlog?.buyerSkuCode && tlog?.originalCustomerNo) {
                                const username = process.env.username;
                                const apikey = process.env.apikey;
                                const sign = crypto.createHash('md5').update(username + apikey + refId).digest('hex');
                                const payload = {
                                    username,
                                    buyer_sku_code: tlog.buyerSkuCode,
                                    customer_no: tlog.originalCustomerNo,
                                    ref_id: refId,
                                    sign,
                                };
                                const { data } = await axios.post(
                                    'https://api.digiflazz.com/v1/transaction',
                                    JSON.stringify(payload),
                                    { headers: { 'Content-Type': 'application/json' } }
                                );
                                const responseData = data?.data || {};
                                if (responseData && typeof responseData.status === 'string') {
                                    await TransactionLog.updateOne(
                                        { id: refId },
                                        {
                                            $set: {
                                                status: normalizeStatus(responseData.status),
                                                serialNumber: responseData.sn || null,
                                                costPrice: typeof responseData.price === 'number' ? responseData.price : tlog?.costPrice,
                                                sellingPrice: tlog?.sellingPrice ?? (typeof responseData.price === 'number' ? responseData.price : undefined),
                                                details: `${responseData.customer_no || '-'} (${responseData.message || '-'})`,
                                                providerTransactionId: responseData.rc || null,
                                                timestamp: new Date(),
                                            }
                                        }
                                    );
                                    try {
                                        await DigiFlazz.findOneAndUpdate({ ref_id: refId }, { status: responseData.status, sn: responseData.sn }, { new: true });
                                    } catch {}
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('Auto status check failed:', error.message);
                    }
                    tlog = await TransactionLog.findOne({ id: refId });
                    status = String(tlog?.status || '').toLowerCase();
                }

                if (status !== 'sukses') {
                    const emoji = status === 'pending' ? '⏳' : status === 'gagal' ? '❌' : '❓';
                    await ctx.replyWithHTML(`${emoji} <b>Struk hanya untuk transaksi sukses.</b>\nStatus sekarang: <b>${(tlog?.status || '-').toUpperCase()}</b>`);
                    return;
                }

                if (!ctx.session) ctx.session = {};
                const productName = tlog?.productName || '-';
                const costPrice = tlog?.costPrice ?? tlog?.sellingPrice ?? 0;
                const costText = formatCurrency(costPrice);

                ctx.session.pendingReceipt = { refId, provider };

                const promptMessage = `💰 <b>Masukkan Harga Jual</b>\n🆔 Ref: <code>${escapeHtml(refId)}</code>\n\n`
                    + `📦 <b>Produk:</b> ${escapeHtml(productName)}\n`
                    + `💸 <b>Harga Beli:</b> Rp ${costText}\n\n`
                    + 'Contoh: 12000';

                await ctx.replyWithHTML(promptMessage);
                return;
            } catch (error) {
                console.error('struk error:', error?.message || error);
                await ctx.replyWithHTML(`❌ <b>Error:</b> <code>${error.message}</code>`);
                return;
            }
        }

        if (ctx.session?.pendingReceipt) {
            const digits = (text || '').trim().replace(/[^0-9]/g, '');
            if (!digits) {
                await ctx.reply('Masukkan angka harga jual, contoh: 12000');
                return;
            }

            const sellingPrice = Number(digits);
            const { refId, provider } = ctx.session.pendingReceipt;
            try {
                const tlog = await TransactionLog.findOne({ id: refId });
                if (!tlog) {
                    ctx.session.pendingReceipt = null;
                    await ctx.reply('Transaksi tidak ditemukan di log');
                    return;
                }

                const status = String(tlog.status || '').toLowerCase();
                if (status !== 'sukses') {
                    ctx.session.pendingReceipt = null;
                    await ctx.reply(`Struk hanya untuk transaksi sukses. Status: ${tlog.status}`);
                    return;
                }

                const timeText = new Date().toLocaleString('id-ID', { timeZone: process.env.TZ || 'Asia/Makassar' });
                const tz = (process.env.TZ || 'Asia/Makassar').includes('Makassar') ? 'WITA' : 'WIB';
                const buffer = await createReceiptImage({
                    provider: provider === 'digiflazz' ? 'Digiflazz' : 'TokoVoucher',
                    status: 'Sukses',
                    refId,
                    timeText,
                    tzLabel: tz,
                    productName: tlog.productName || '-',
                    customerNo: tlog.originalCustomerNo || '-',
                    category: tlog.productCategoryFromProvider || tlog.categoryKey || '-',
                    brand: tlog.productBrandFromProvider || tlog.iconName || '-',
                    serialNumber: tlog.serialNumber || '',
                    sellingPrice,
                });

                await ctx.replyWithPhoto({ source: buffer }, { caption: `🧾 Struk transaksi\nRef: ${refId}` });
            } catch (error) {
                await ctx.replyWithHTML(`❌ <b>Gagal membuat struk:</b> <code>${error.message}</code>`);
            } finally {
                ctx.session.pendingReceipt = null;
            }
            return;
        }

        return next();
    };
}

module.exports = {
    createReceiptCommandMiddleware,
};
