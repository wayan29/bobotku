const telegraf = require('telegraf');
const SCENE_KEYS = require('../constants/sceneKeys');
const { showKeyboardChunk, splitList } = require('../services/keyboard');
const { getRefId } = require('../services/http_toko');
const pln = require('../services/plncuy');
const { safeText, safeDestination } = require('../utils/sanitize');
const {
    saveVerifiedPln,
    findSavedPlnByCustomerNo,
    getSavedPlnList,
    mapSavedPlnToVerification,
} = require('../services/savePln');

const PLN_PICK_SAVED = '📚 Ambil dari database';
const PLN_PICK_NEW = '✍️ Masukkan ID baru';
const PLN_PICK_BACK = '↩️ Pilihan PLN';
const PLN_LIST_CHUNK_SIZE = 10;

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDateTime = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleString('id-ID', {
        timeZone: process.env.TZ || 'Asia/Makassar',
        dateStyle: 'short',
        timeStyle: 'short',
    });
};

const isTokovoucherPlnCategory = (ctx) => String(ctx.session.selectedCategory?.id || '') === '8';

const promptPlnSource = async (ctx) => {
    const savedList = ctx.session.savedPlnOptions || [];

    if (savedList.length === 0) {
        ctx.session.tovInputStep = 'awaiting_pln_number';
        await ctx.reply(
            'Belum ada ID PLN tersimpan. Masukkan ID PLN baru:',
            showKeyboardChunk(['⬅️ Kembali'])
        );
        return;
    }

    await ctx.reply(
        `Pilih sumber ID PLN:\n• Tersimpan di database global: ${savedList.length} ID\n• Bisa pilih dari database atau masukkan ID baru`,
        showKeyboardChunk([PLN_PICK_SAVED, PLN_PICK_NEW, '⬅️ Kembali'], 2)
    );
    ctx.session.tovInputStep = 'awaiting_pln_source';
};

const showSavedPlnChoices = async (ctx) => {
    const savedList = ctx.session.savedPlnOptions || [];

    if (savedList.length === 0) {
        ctx.session.tovInputStep = 'awaiting_pln_number';
        await ctx.reply('Belum ada ID PLN tersimpan. Masukkan ID PLN baru:', showKeyboardChunk(['⬅️ Kembali']));
        return;
    }

    const chunks = splitList(savedList, PLN_LIST_CHUNK_SIZE);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];
        const startIndex = chunkIndex * PLN_LIST_CHUNK_SIZE;
        const lines = [`📚 <b>Daftar ID PLN Tersimpan Global</b> (${chunkIndex + 1}/${chunks.length})\n`];

        chunk.forEach((item, index) => {
            const absoluteIndex = startIndex + index;
            lines.push(
                `${String(absoluteIndex + 1).padStart(2, '0')}. <code>${escapeHtml(item.customerNo || '-')}</code>/<b>${escapeHtml(item.name || '-')}</b>`
            );
        });

        lines.push('');

        if (chunkIndex === chunks.length - 1) {
            lines.push('Ketik nomor untuk memilih ID PLN.');
            await ctx.replyWithHTML(
                lines.join('\n'),
                showKeyboardChunk([PLN_PICK_NEW, PLN_PICK_BACK, '⬅️ Kembali'], 2)
            );
        } else {
            await ctx.replyWithHTML(lines.join('\n'));
        }
    }

    ctx.session.tovInputStep = 'awaiting_saved_pln_choice';
};

const botMenu = new telegraf.Scenes.BaseScene(SCENE_KEYS.OPSI1);
botMenu.enter(async (ctx) => {
    const selectedJenis = ctx.session.selectedProduct;
    const BOT = ctx.session.selectedBot;

    if (BOT === 'TokoVoucher') {
        // Generate and store ref ID for TokoVoucher ahead of confirmation
        try {
            ctx.session.refId = await getRefId();
        } catch (e) {
            // fallback: keep undefined; will be regenerated on confirm
            ctx.session.refId = ctx.session.refId || null;
        }
        ctx.session.codeList = ctx.session.selectedProduct.code;
        ctx.session.plnVerification = null;
        const keyboardaja = showKeyboardChunk(["⬅️ Kembali"]);

        const statusText = selectedJenis.status ? '✅ <b>Tersedia</b>' : '❌ <b>Gangguan</b>';
        const promptLabel = isTokovoucherPlnCategory(ctx)
            ? '🔌 <b>Pilih atau masukkan ID PLN</b>'
            : '📱 <b>Masukkan Nomor Tujuan</b>';

        const message = `📦 <b>Detail Produk</b>\n\n`
        + `🏷️ Kode: <code>${ctx.session.codeList}</code>\n`
        + `📛 Nama: <b>${ctx.session.selectedProduct.nama_produk}</b>\n`
        + `💰 Harga: Rp ${Number(ctx.session.selectedProduct.price).toLocaleString('id-ID')}\n`
        + `📊 Status: ${statusText}\n\n`
        + (ctx.session.refId ? `🆔 Ref ID: <code>${ctx.session.refId}</code>\n\n` : '')
        + promptLabel;

        await ctx.replyWithHTML(message, keyboardaja);

        if (isTokovoucherPlnCategory(ctx)) {
            try {
                ctx.session.savedPlnOptions = await getSavedPlnList({
                    chatId: ctx.chat?.id,
                });
            } catch (error) {
                ctx.session.savedPlnOptions = [];
                console.error('Error loading saved PLN list for TokoVoucher:', error.message);
            }

            await promptPlnSource(ctx);
            return;
        }

        ctx.session.tovInputStep = 'awaiting_destination';
    }
});

botMenu.on('text', async (ctx) => {
    const pesan = safeText(ctx);
    if (pesan === "⬅️ Kembali") {
        ctx.scene.enter(SCENE_KEYS.PRICE);
        return;
    }

    const BOT = ctx.session.selectedBot;
    if (BOT === 'TokoVoucher') {
        const inputStep = ctx.session.tovInputStep || 'awaiting_destination';

        if (isTokovoucherPlnCategory(ctx)) {
            if (pesan === PLN_PICK_BACK) {
                await promptPlnSource(ctx);
                return;
            }

            if (inputStep === 'awaiting_pln_source') {
                const pickSaved = pesan === PLN_PICK_SAVED || /^1$/.test(pesan) || /database/i.test(pesan);
                const pickNew = pesan === PLN_PICK_NEW || /^2$/.test(pesan) || /baru/i.test(pesan);

                if (pickSaved) {
                    await showSavedPlnChoices(ctx);
                    return;
                }

                if (pickNew) {
                    ctx.session.plnVerification = null;
                    ctx.session.nomorTujuan = null;
                    ctx.session.tovInputStep = 'awaiting_pln_number';
                    await ctx.reply('Masukkan ID PLN baru:', showKeyboardChunk([PLN_PICK_BACK, '⬅️ Kembali'], 2));
                    return;
                }

                ctx.session.plnVerification = null;
                ctx.session.tovInputStep = 'awaiting_pln_number';
            }

            if (inputStep === 'awaiting_pln_source' || inputStep === 'awaiting_pln_number') {
                const customerNo = pesan.trim();
                let cachedPln = null;

                try {
                    cachedPln = await findSavedPlnByCustomerNo({
                        chatId: ctx.chat?.id,
                        customerNo,
                    });
                } catch (error) {
                    console.error('Error finding saved PLN for TokoVoucher:', error.message);
                }

                if (cachedPln) {
                    ctx.session.nomorTujuan = customerNo;
                    ctx.session.plnVerification = mapSavedPlnToVerification(cachedPln);
                    ctx.session.tovInputStep = 'completed';
                    await ctx.replyWithHTML(
                        `✅ <b>ID PLN ditemukan di database</b>\n\n<code>${escapeHtml(customerNo)}</code>/<b>${escapeHtml(ctx.session.plnVerification.name || '-')}</b>${formatDateTime(cachedPln.lastVerifiedAt) ? `\nTerakhir validasi: ${escapeHtml(formatDateTime(cachedPln.lastVerifiedAt))}` : ''}`
                    );
                    ctx.scene.enter(SCENE_KEYS.OPSI2);
                    return;
                }

                try {
                    const verification = await pln(customerNo);
                    if (verification && verification.status === 'Sukses') {
                        ctx.session.nomorTujuan = customerNo;
                        ctx.session.plnVerification = {
                            name: verification.name,
                            meter_no: verification.meter_no,
                            subscriber_id: verification.subscriber_id,
                            segment_power: verification.segment_power,
                        };

                        try {
                            await saveVerifiedPln({
                                chatId: ctx.chat?.id,
                                username: ctx.from?.username || ctx.from?.id?.toString(),
                                customerNo,
                                verification: ctx.session.plnVerification,
                                source: 'tokovoucher_validation',
                                refId: ctx.session.refId,
                                productName: ctx.session.selectedProduct?.nama_produk,
                            });
                        } catch (saveError) {
                            console.error('Error saving PLN verification from TokoVoucher:', saveError.message);
                        }

                        ctx.session.tovInputStep = 'completed';
                        await ctx.replyWithHTML(
                            `✅ <b>Validasi PLN berhasil</b>\n\n<code>${escapeHtml(customerNo)}</code>/<b>${escapeHtml(ctx.session.plnVerification.name || '-')}</b>`
                        );
                        ctx.scene.enter(SCENE_KEYS.OPSI2);
                        return;
                    }

                    await ctx.replyWithHTML(
                        `❌ <b>Validasi PLN gagal</b>\n\n<code>${escapeHtml(customerNo)}</code>\n${escapeHtml(verification?.message || 'Data tidak valid')}`,
                        showKeyboardChunk([PLN_PICK_BACK, '⬅️ Kembali'], 2)
                    );
                    return;
                } catch (error) {
                    await ctx.reply(
                        '⚠️ Terjadi kesalahan saat cek ID PLN. Silakan coba lagi.',
                        showKeyboardChunk([PLN_PICK_BACK, '⬅️ Kembali'], 2)
                    );
                    return;
                }
            }

        }

        ctx.session.nomorTujuan = safeDestination(pesan) || pesan;
        ctx.scene.enter(SCENE_KEYS.OPSI2);
    }
});

module.exports = botMenu;
