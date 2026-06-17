const pln = require('../services/plncuy');
const { inquireFFNickname } = require('../services/ffNickname');
const { inquireMobileLegendsNickname } = require('../services/mlNickname');
const { saveVerifiedPln } = require('../services/savePln');
const { reloadPricelistFromAPI } = require('../services/http');

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const checkPln = async (ctx, next) => {
    const text = ctx.message?.text;
    if (typeof text === 'string' && text.startsWith('/pln ')) {
        const noPelanggan = text.slice(5).trim();
        try {
            const data = await pln(noPelanggan);

            if (data && data.status === 'Sukses') {
                try {
                    await saveVerifiedPln({
                        chatId: ctx.chat?.id,
                        username: ctx.from?.username || ctx.from?.id?.toString(),
                        customerNo: noPelanggan,
                        verification: data,
                        source: 'pln_command',
                    });
                } catch (saveError) {
                    console.error('Error saving PLN verification from /pln:', saveError.message);
                }

                const message = `✅ *Validasi Nama Berhasil*\n\n`
                    + `*Nama*: ${data.name}\n`
                    + `*No Meter*: ${data.meter_no}\n`
                    + `*ID Pelanggan*: ${data.subscriber_id}\n`
                    + `*Daya*: ${data.segment_power}\n`
                    + '*Tersimpan*: Ya\n\n'
                    + '_Terima kasih telah menggunakan layanan kami._';
                ctx.reply(message, { parse_mode: 'Markdown' });
            } else if (data && data.status === 'Gagal') {
                const message = `❌ *Validasi Nama Gagal*\n\n`
                    + `*Code*: ${data.message || 'Kesalahan tidak diketahui'}\n`
                    + `*Status*: ${data.status}\n`
                    + `*No Pelanggan*: ${data.customer_no}\n\n`
                    + '_Periksa kembali nomor pelanggan Anda atau coba beberapa saat lagi._';
                ctx.reply(message, { parse_mode: 'Markdown' });
            } else {
                ctx.reply('❗ Respons data tidak valid. Silakan coba lagi.');
            }
        } catch (error) {
            ctx.reply('⚠️ Terjadi kesalahan saat mengambil data. Silakan coba lagi nanti.');
            console.error('Error:', error.message);
        }
        return;
    }

    if (text === '/pln') {
        ctx.reply('❓ *Mohon masukkan nomor pelanggan setelah perintah /pln*', { parse_mode: 'Markdown' });
        return;
    }

    next();
};

const checkFF = async (ctx, next) => {
    const text = ctx.message?.text;
    if (typeof text === 'string' && text.startsWith('/ff ')) {
        const userId = text.slice(4).trim();
        if (!userId) {
            return ctx.reply('❓ *Mohon masukkan User ID setelah perintah /ff*\n\nContoh: /ff 123456789', { parse_mode: 'Markdown' });
        }
        try {
            await ctx.reply('🔍 Mencari nickname Free Fire...');
            const result = await inquireFFNickname(userId);

            if (result.isSuccess && result.nickname) {
                const message = `✅ <b>Nickname Free Fire Ditemukan</b>\n\n`
                    + `<b>User ID</b>: ${escapeHtml(userId)}\n`
                    + `<b>Nickname</b>: ${escapeHtml(result.nickname)}\n\n`
                    + `<i>${escapeHtml(result.message)}</i>`;
                ctx.reply(message, { parse_mode: 'HTML' });
            } else {
                const message = `❌ <b>Nickname Tidak Ditemukan</b>\n\n`
                    + `<b>User ID</b>: ${escapeHtml(userId)}\n`
                    + `<b>Pesan</b>: ${escapeHtml(result.message || 'User ID tidak valid')}\n\n`
                    + '<i>Periksa kembali User ID Anda.</i>';
                ctx.reply(message, { parse_mode: 'HTML' });
            }
        } catch (error) {
            ctx.reply('⚠️ Terjadi kesalahan saat mengambil data. Silakan coba lagi nanti.');
            console.error('Error checking FF nickname:', error.message);
        }
        return;
    }

    if (text === '/ff') {
        ctx.reply('❓ *Mohon masukkan User ID setelah perintah /ff*\n\nContoh: /ff 123456789', { parse_mode: 'Markdown' });
        return;
    }

    next();
};

const checkML = async (ctx, next) => {
    const text = ctx.message?.text;
    if (typeof text === 'string' && text.startsWith('/ml ')) {
        const args = text.slice(4).trim().split(/\s+/);
        if (args.length < 2) {
            return ctx.reply('❓ *Mohon masukkan User ID dan Server ID*\n\nContoh: /ml 123456789 1234', { parse_mode: 'Markdown' });
        }
        const [userId, zoneId] = args;
        try {
            await ctx.reply('🔍 Mencari nickname Mobile Legends...');
            const result = await inquireMobileLegendsNickname(userId, zoneId);

            if (result.isSuccess && result.nickname) {
                let message = `✅ <b>Nickname Mobile Legends Ditemukan</b>\n\n`
                    + `<b>User ID</b>: ${escapeHtml(userId)}\n`
                    + `<b>Server ID</b>: ${escapeHtml(zoneId)}\n`
                    + `<b>Nickname</b>: ${escapeHtml(result.nickname)}\n`;
                if (result.country) {
                    message += `<b>Region</b>: ${escapeHtml(result.country)}\n`;
                }
                message += `\n<i>${escapeHtml(result.message)}</i>`;
                ctx.reply(message, { parse_mode: 'HTML' });
            } else {
                const message = `❌ <b>Nickname Tidak Ditemukan</b>\n\n`
                    + `<b>User ID</b>: ${escapeHtml(userId)}\n`
                    + `<b>Server ID</b>: ${escapeHtml(zoneId)}\n`
                    + `<b>Pesan</b>: ${escapeHtml(result.message || 'User ID atau Server ID tidak valid')}\n\n`
                    + '<i>Periksa kembali User ID dan Server ID Anda.</i>';
                ctx.reply(message, { parse_mode: 'HTML' });
            }
        } catch (error) {
            ctx.reply('⚠️ Terjadi kesalahan saat mengambil data. Silakan coba lagi nanti.');
            console.error('Error checking ML nickname:', error.message);
        }
        return;
    }

    if (text === '/ml') {
        ctx.reply('❓ *Mohon masukkan User ID dan Server ID*\n\nContoh: /ml 123456789 1234', { parse_mode: 'Markdown' });
        return;
    }

    next();
};

const reloadDigiflazzPricelist = async (ctx, next) => {
    const text = ctx.message?.text;
    if (text === '/reloaddg') {
        try {
            const loadingMsg = await ctx.replyWithHTML(`
⏳ <b>MEMPERBARUI PRICELIST DIGIFLAZZ</b>

🔄 <i>Mengambil data dari API Digiflazz...</i>
💾 <i>Mohon tunggu, proses ini mungkin memakan waktu beberapa detik...</i>
            `);

            const result = await reloadPricelistFromAPI();

            try {
                await ctx.deleteMessage(loadingMsg.message_id);
            } catch (error) {
                console.log('Could not delete loading message');
            }

            if (result.success) {
                const message = `
✅ <b>PRICELIST BERHASIL DIPERBARUI</b>

📊 <b>Statistik:</b>
• Total Produk: <b>${result.stats.totalProducts.toLocaleString('id-ID')}</b>
• Total Kategori: <b>${result.stats.totalCategories}</b>
• Total Brand: <b>${result.stats.totalBrands}</b>

🔄 <b>Perubahan:</b>
• Produk Baru: <b>${result.stats.inserted}</b>
• Produk Diupdate: <b>${result.stats.updated}</b>

⏰ <i>Diperbarui pada: ${new Date().toLocaleString('id-ID')}</i>
                `;
                await ctx.replyWithHTML(message);
            } else {
                const errorMessage = `
❌ <b>GAGAL MEMPERBARUI PRICELIST</b>

📝 <b>Error:</b> <i>${result.message}</i>

💡 <i>Silakan coba lagi atau hubungi admin jika masalah berlanjut</i>
                `;
                await ctx.replyWithHTML(errorMessage);
            }
        } catch (error) {
            console.error('Error reloading Digiflazz pricelist:', error?.message || error);
            const errorMessage = `
❌ <b>TERJADI KESALAHAN</b>

📝 <b>Error:</b> <code>${error.message}</code>

💡 <i>Silakan coba lagi nanti</i>
            `;
            await ctx.replyWithHTML(errorMessage);
        }
        return;
    }

    return next();
};

module.exports = {
    checkPln,
    checkFF,
    checkML,
    reloadDigiflazzPricelist,
};
