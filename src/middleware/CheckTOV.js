const path = require('path');
const dotenvPath = path.resolve(__dirname, '../../.env');
const envConfig = require('dotenv').config({ path: dotenvPath }).parsed;
const axios = require('axios');
const crypto = require('crypto');
const TokoV = require('../models/tov');
const { numberWithCommas } = require('../services/http_toko');
const { upsertTransactionLog, toNumeric } = require('../services/upsertTransactionLog');

function redactUrlText(text) {
  if (!text) return text;
  return String(text).replace(/signature=([^&\s]+)/gi, 'signature=***');
}

const TELEGRAM_SOURCE = 'telegram_bot';

if (!envConfig) {
    throw new Error(`Failed to load .env file from ${dotenvPath}`);
}

// Validate required environment variables
const requiredEnvVars = ['member_code', 'secret'];
const missingEnvVars = requiredEnvVars.filter(varName => !envConfig[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars);
    console.error('📁 Checking .env file at:', dotenvPath);
    console.error('Current environment config:', {
        member_code: envConfig.member_code ? '***set***' : undefined,
        secret: envConfig.secret ? '***set***' : undefined,
        signature: envConfig.signature ? '***set***' : undefined
    });
    throw new Error('Missing required environment variables: ' + missingEnvVars.join(', '));
}

// Function to create transaction log (upsert to avoid duplicates)
async function createTransactionLog(transactionData, user, source = TELEGRAM_SOURCE) {
    try {
        const {
            status,
            message,
            sn,
            ref_id,
            trx_id,
            produk,
            price
        } = transactionData;

        const parsedPrice = toNumeric(price);
        return upsertTransactionLog({
            id: ref_id,
            provider: 'tokovoucher',
            user,
            source,
            status,
            message,
            serialNumber: sn,
            productName: produk || undefined,
            buyerSkuCode: undefined,
            originalCustomerNo: undefined,
            categoryName: undefined,
            brandName: undefined,
            providerTransactionId: trx_id,
            costPrice: parsedPrice,
            sellingPrice: parsedPrice,
            timestamp: new Date(),
        });
    } catch (error) {
        console.warn("TransactionLog upsert warning:", error?.message || error);
        // Don't throw error to avoid breaking main flow
        return null;
    }
}

const tov = {
    memberCode: envConfig.member_code,
    secret: envConfig.secret,

    generateSignature(refIdNumber) {
        if (!this.memberCode || !this.secret || !refIdNumber) {
            throw new Error('Missing required parameters for signature generation');
        }

        // Use : as separator according to the formula: md5(MEMBER_CODE:SECRET:REF_ID)
        const stringToHash = `${this.memberCode}:${this.secret}:${refIdNumber}`;
        const signature = crypto.createHash('md5').update(stringToHash).digest('hex');
        
        return signature;
    },

    async checkTransactionStatus(refIdNumber) {
        console.log('\n🔍 Checking Transaction Status:');
        console.log('└─ Reference ID:', refIdNumber);

        // Generate signature with proper 'this' context
        const signature = this.generateSignature(refIdNumber);
        const baseUrl = 'https://api.tokovoucher.net/v1/transaksi/status';
        
        try {
            const url = new URL(baseUrl);
            url.searchParams.append('ref_id', refIdNumber);
            url.searchParams.append('member_code', this.memberCode);
            url.searchParams.append('signature', signature);

            console.log('\n📡 Sending Request:');
            console.log('└─ URL:', redactUrlText(url.toString()));

            const response = await axios.get(url.toString(), {
                headers: { 'Accept': 'application/json' },
                timeout: Number(process.env.TOV_TIMEOUT_MS || 15000),
                maxRedirects: 0,
            });

            const { data } = response;
            if (data.status === 0) {
                console.error('\n❌ API Error:', data.error_msg);
                throw new Error(data.error_msg);
            }

            if (!data.ref_id || !data.trx_id) {
                console.error('\n❌ Invalid Response Data');
                throw new Error('Response data tidak valid');
            }

            const result = {
                status: data.status,
                message: data.message,
                sn: data.sn || '',
                ref_id: data.ref_id,
                trx_id: data.trx_id,
                produk: data.produk,
                sisa_saldo: data.sisa_saldo,
                price: data.price
            };

            // Transaction status logging removed

            return result;
        } catch (error) {
            console.error('\n❌ Error:', error.response?.data?.error_msg || error.message);
            throw new Error(error.response?.data?.error_msg || error.message);
        }
    },
};

const checkStatus = async (ctx, next) => {
    // Dukung cek status via "/tov <ref_id>" (baru) dan "/tovcheck <ref_id>" (alias lama)
    const tovCheckMatch = ctx?.message?.text?.match(/^\/(?:tov|tovcheck)\s+(.+)/);
    
    if (!tovCheckMatch) {
        return next();
    }

    const refIdNumber = tovCheckMatch[1].trim();
    
    if (!refIdNumber) {
        return ctx.replyWithHTML(`❌ <b>FORMAT SALAH</b>

📝 <b>Cara penggunaan:</b>
<code>/tov [ref_id]</code>

💡 <b>Contoh:</b>
<code>/tov TOV123456789</code>`);
    }

    await ctx.replyWithHTML(`⏳ <b>MENGECEK STATUS TRANSAKSI</b>

🔍 <i>Sedang memproses Ref ID: <code>${refIdNumber}</code></i>
🏪 <i>Menghubungi TokoVoucher API...</i>
📡 <i>Mohon tunggu sebentar...</i>`);

    try {
        // If DB unified, detect provider from TransactionLog and redirect if needed
        try {
            const tlog = await TransactionLog.findOne({ id: refIdNumber }).lean().exec();
            if (tlog && tlog.provider === 'digiflazz') {
                const { checkTransactionStatus } = require('./Digiflazz');
                const data = await checkTransactionStatus(refIdNumber);
                let statusEmoji, statusText, statusColor;
                switch ((data.status||'').toLowerCase()) {
                    case 'sukses': statusEmoji='✅'; statusColor='🟢'; statusText='SUKSES'; break;
                    case 'pending': statusEmoji='⏳'; statusColor='🟡'; statusText='PENDING'; break;
                    case 'gagal': statusEmoji='❌'; statusColor='🔴'; statusText='GAGAL'; break;
                    default: statusEmoji='❓'; statusColor='⚪'; statusText=(data.status||'UNKNOWN').toUpperCase();
                }
                const msg = `${statusEmoji} <b>STATUS TRANSAKSI (Digiflazz)</b>\n\n${statusColor} Status: <b>${statusText}</b>\n🆔 Ref ID: <code>${data.ref_id||refIdNumber}</code>${data.sn?`\n🎮 SN:\n<code>${data.sn}</code>`:''}${data.message?`\n\n📝 Pesan:\n<i>${data.message}</i>`:''}`;
                await ctx.replyWithHTML(msg);
                return;
            }
        } catch{}

        const data = await tov.checkTransactionStatus(refIdNumber);
        
        let statusEmoji, statusText, statusColor;
        switch (data.status?.toLowerCase()) {
            case 'sukses':
                statusEmoji = '✅';
                statusColor = '🟢';
                statusText = 'SUKSES';
                break;
            case 'pending':
                statusEmoji = '⏳';
                statusColor = '🟡';
                statusText = 'PENDING';
                break;
            case 'gagal':
            case 'failed':
                statusEmoji = '❌';
                statusColor = '🔴';
                statusText = 'GAGAL';
                break;
            default:
                statusEmoji = '❓';
                statusColor = '⚪';
                statusText = data.status?.toUpperCase() || 'UNKNOWN';
                break;
        }

        const message = `${statusEmoji} <b>STATUS TRANSAKSI</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 <b>Detail Transaksi:</b>

${statusColor} Status: <b>${statusText}</b>
🆔 Ref ID: <code>${data.ref_id}</code>
🔢 Trx ID: <code>${data.trx_id}</code>

${data.sn ? `🎮 Serial Number:\n<code>${data.sn}</code>\n\n` : ''}${data.message ? `📝 Pesan:\n<i>${data.message}</i>\n\n` : ''}💰 Harga: Rp ${data.price ? numberWithCommas(Number(data.price)) : 'N/A'}
💳 Saldo: Rp ${data.sisa_saldo ? numberWithCommas(Number(data.sisa_saldo)) : 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ <i>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</i>
🏪 <i>TokoVoucher API</i>`;

        await ctx.replyWithHTML(message);

        if (data.status) {
            await TokoV.findOneAndUpdate(
                { ref_id: refIdNumber },
                { status: data.status, sn: data.sn },
                { new: true }
            );
            
            // Create transaction log in new format for all status updates
        const username = ctx.message.from.username || ctx.message.from.id.toString();
        await createTransactionLog(data, username, TELEGRAM_SOURCE);
        }
    } catch (error) {
        const now = new Date();
        const errorTime = now.toLocaleString('id-ID', { 
            timeZone: 'Asia/Jakarta',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        let reason;
        const errorMsg = error.message;

        if (errorMsg.includes('Signature Invalid')) {
            reason = '• Signature tidak valid\n• Secret key tidak sesuai\n• Format signature salah';
        } else if (errorMsg.includes('Ip Not Allow')) {
            reason = '• IP Address tidak diizinkan\n• Perlu whitelist IP\n• Hubungi admin TokoVoucher';
        } else {
            reason = '• Koneksi tidak stabil\n• Server sedang maintenance\n• Data tidak ditemukan';
        }

        const errorMessage = `❌ <b>KESALAHAN SISTEM</b>

🔍 <b>Detail Error:</b>
• Ref ID: <code>${refIdNumber}</code>
• Status: <b>GAGAL</b>
• Pesan: <code>${errorMsg}</code>

📋 <b>Kemungkinan Penyebab:</b>
${reason}

💡 <b>Solusi:</b>
• Periksa format Ref ID
• Tunggu beberapa saat
• Hubungi admin jika berlanjut

ℹ️ <b>Bantuan:</b>
• Format: <code>/tov [ref_id]</code>
• Contoh: <code>/tov TOV123456789</code>

⏰ <i>Error Time: ${errorTime}</i>`;

        return ctx.replyWithHTML(errorMessage);
    }
};

const GetAll = async (ctx, next) => {
    // List transaksi hanya jika persis "/tov" tanpa argumen
    if (ctx?.message?.text === '/tov') {
        try {
            const data = await TransactionLog.find({ provider: 'tokovoucher' }).sort({ timestamp: -1 });
            
            if (data.length === 0) {
                return ctx.replyWithHTML(`🏪 <b>DAFTAR TRANSAKSI</b>

❌ <i>Tidak ada transaksi yang ditemukan</i>

💡 <b>Tips:</b>
• Gunakan /tov [ref_id] untuk cek status transaksi
• Format: /tov [ref_id]`);
            }

            let message = `🏪 <b>DAFTAR TRANSAKSI TERAKHIR</b>\n\n`;
            
            data.slice(0, 10).forEach((trx, index) => {
                const status = {
                    'sukses': '✅',
                    'pending': '⏳',
                    'gagal': '❌'
                }[trx.status?.toLowerCase()] || '❓';

                message += `${status} <b>${(trx.status||'-').toUpperCase()}</b>\n`;
                message += `🆔 Ref ID: <code>${trx.id}</code>\n`;
                if (trx.serialNumber) message += `🎮 SN: <code>${trx.serialNumber}</code>\n`;
                message += `\n`;
            });

            message += `━━━━━━━━━━━━━━━━\n`;
            message += `📝 Menampilkan 10 transaksi terakhir\n`;
            message += `⏰ <i>${new Date().toLocaleString('id-ID')}</i>`;

            return ctx.replyWithHTML(message);
        } catch (error) {
            return ctx.replyWithHTML(`❌ <b>ERROR</b>\n\n<code>${error.message}</code>`);
        }
    }
    return next();
};

module.exports = {
    checkStatus,
    GetAll,
    // Export raw checker for reuse (e.g., /struk)
    async checkTovStatus(refId) {
        return tov.checkTransactionStatus(refId);
    }
};
