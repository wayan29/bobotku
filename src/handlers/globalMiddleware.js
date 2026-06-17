const {
    canAccessBot,
    escapeHtml,
    findOrCreateUser,
    getChatId,
} = require('../services/accessControl');

const HELP_MESSAGE = `
ℹ️ <b>BANTUAN PERINTAH</b>

<b>Umum</b>
• /start — mulai interaksi
• /help — tampilkan bantuan ini
• /me — lihat Chat ID, role, dan status akses

<b>Akses Owner/Admin</b>
• /users — lihat daftar user
• /approve <i>&lt;chatId&gt;</i> — izinkan user
• /deny <i>&lt;chatId&gt;</i> — cabut akses user
• /promote <i>&lt;chatId&gt;</i> — jadikan admin (owner-only)
• /demote <i>&lt;chatId&gt;</i> — turunkan admin jadi user biasa (owner-only)
• /deleteuser <i>&lt;chatId&gt;</i> — hapus data user dari whitelist

<b>TokoVoucher</b>
• /tov — daftar transaksi terakhir
• /tov <i>&lt;ref_id&gt;</i> — cek status transaksi (alias: <code>/tovcheck</code>)

<b>Digiflazz</b>
• /dg — daftar transaksi
• /dg <i>&lt;ref_id&gt;</i> — cek status transaksi (alias: <code>/digicheck</code>, <code>/digi &lt;ref_id&gt;</code>)
• /reloaddg — perbarui pricelist dari API Digiflazz

<b>Utilitas</b>
• /pln <i>&lt;no_pelanggan&gt;</i> — validasi nama/ID PLN
• /op <i>&lt;nomor_hp&gt;</i> — deteksi operator seluler
• /ff <i>&lt;user_id&gt;</i> — cek nickname Free Fire
• /ml <i>&lt;user_id&gt;</i> <i>&lt;server_id&gt;</i> — cek nickname Mobile Legends
• /transactions — 10 log transaksi terakhir

<i>Beberapa fitur hanya untuk pengguna yang di-whitelist.</i>`;

async function helpMiddleware(ctx, next) {
    const text = ctx.message?.text;
    if (typeof text === 'string' && text.startsWith('/help')) {
        try {
            await ctx.replyWithHTML(HELP_MESSAGE);
        } catch (error) {
            console.error('Error sending help:', error?.message || error);
        }
        return;
    }

    return next();
}

async function premiumAccessMiddleware(ctx, next) {
    const chatId = getChatId(ctx);
    if (!chatId) return next();

    try {
        const user = await findOrCreateUser(ctx);
        if (canAccessBot(user)) {
            return next();
        }

        try {
            if (ctx.updateType === 'callback_query') await ctx.answerCbQuery('Akses belum diizinkan');
        } catch (error) {}

        return ctx.replyWithHTML(
            `Akses Anda belum diizinkan owner.\n\nChat ID: <code>${escapeHtml(chatId)}</code>\nKirim Chat ID ini ke owner untuk approval.`
        );
    } catch (error) {
        console.error('Error checking access status:', error?.message || error);
        return ctx.reply('Terjadi kesalahan saat memeriksa akses Anda.');
    }
}

module.exports = {
    helpMiddleware,
    premiumAccessMiddleware,
};
