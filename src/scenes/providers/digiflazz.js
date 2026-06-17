const { performTransaction } = require('../../services/http');
const DigiFlazz = require('../../models/trxdigi');
const { showKeyboardChunk, splitList } = require('../../services/keyboard');
const { numberWithCommas } = require('../../utils/formatters');
const { inquireFFNickname } = require('../../services/ffNickname');
const { generateRefId } = require('../../utils/refid');
const SCENE_KEYS = require('../../constants/sceneKeys');
const { resetSessionForBot } = require('../../utils/sessionState');
const { upsertTransactionLog, normalizeStatus, toNumeric } = require('../../services/upsertTransactionLog');
const pln = require('../../services/plncuy');
const {
    saveVerifiedPln,
    findSavedPlnByCustomerNo,
    getSavedPlnList,
    mapSavedPlnToVerification,
} = require('../../services/savePln');

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

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const formatCurrency = (amount) => {
    if (!hasValue(amount)) return 'N/A';
    const numeric = Number(amount);
    if (Number.isNaN(numeric)) return 'N/A';
    return numberWithCommas(numeric);
};

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

const isPlnContext = (ctx) => {
    const values = [
        ctx.session.selectedCategory,
        ctx.session.selectedBrand,
        ctx.session.selectedProduct?.brand,
        ctx.session.selectedProduct?.category,
        ctx.session.selectedProduct?.product_name,
    ];

    return values.some((value) => {
        const text = (value || '').toString().toLowerCase();
        return text.includes('pln') || text.includes('token listrik');
    });
};

const buildPlnVerificationBlock = (verification, extraLines = []) => {
    if (!verification?.name) return '';

    const lines = [
        '🔌 <b>Verifikasi PLN</b>',
        `• Nama: <b>${escapeHtml(verification.name)}</b>`,
        `• No. Meter: <code>${escapeHtml(verification.meter_no || '-')}</code>`,
        `• ID Pelanggan: <code>${escapeHtml(verification.subscriber_id || '-')}</code>`,
        `• Daya: ${escapeHtml(verification.segment_power || '-')}`,
    ];

    extraLines
        .filter(Boolean)
        .forEach((line) => lines.push(`• ${escapeHtml(line)}`));

    return `${lines.join('\n')}\n`;
};

const buildConfirmationText = (ctx, verifyBlock = '') => {
    const p = ctx.session.selectedProduct || {};
    let confirmText = `✅ <b>KONFIRMASI PESANAN</b>\n\n`;
    confirmText += `📦 <b>Produk:</b> ${escapeHtml(p.product_name || '-')}\n`;
    confirmText += `💰 <b>Harga:</b> Rp ${numberWithCommas(p.price || 0)}\n`;
    confirmText += `👤 <b>Pelanggan:</b> <code>${escapeHtml(ctx.session.customerNo || '-')}</code>\n`;

    if (hasValue(ctx.session.operatorInfo?.name)) {
        const operator = ctx.session.operatorInfo;
        const operatorLabel = operator.name ? operator.name.toString().toUpperCase() : '';
        const prefixText = hasValue(operator.prefix) ? ` (prefix ${escapeHtml(operator.prefix)})` : '';
        confirmText += `📡 <b>Operator:</b> ${operator.emoji || ''} <b>${escapeHtml(operatorLabel)}</b>${prefixText}\n`;
    }

    if (verifyBlock) {
        confirmText += `\n${verifyBlock}`;
    }

    confirmText += `\n🆔 <b>Ref ID:</b> <code>${escapeHtml(ctx.session.refId || '-')}</code>\n\n`;
    confirmText += `Apakah data sudah sesuai?`;

    return confirmText;
};

const sendConfirmationPrompt = async (ctx, verifyBlock = '') => {
    await ctx.replyWithHTML(
        buildConfirmationText(ctx, verifyBlock),
        showKeyboardChunk(['✅ Setuju', '❌ Batal', '⬅️ Kembali'], 3)
    );
    ctx.session.digiStep = 'awaiting_confirm';
};

const promptCustomerNumber = async (ctx, isPln = false) => {
    const buttons = isPln
        ? [PLN_PICK_BACK, '⬅️ Kembali']
        : ['⬅️ Kembali'];
    const prompt = isPln
        ? 'Masukkan ID PLN baru:'
        : 'Masukkan nomor pelanggan:';

    await ctx.reply(prompt, showKeyboardChunk(buttons, 2));
};

const promptPlnSource = async (ctx) => {
    const savedList = ctx.session.savedPlnOptions || [];

    if (savedList.length === 0) {
        ctx.session.digiStep = 'awaiting_number';
        await ctx.reply(
            'Belum ada ID PLN tersimpan. Masukkan ID PLN baru:',
            showKeyboardChunk(['⬅️ Kembali'])
        );
        return;
    }

    const infoText = [
        'Pilih sumber ID PLN:',
        `• Tersimpan di database global: ${savedList.length} ID`,
        '• Bisa pilih dari database atau masukkan ID baru',
    ].join('\n');

    await ctx.reply(
        infoText,
        showKeyboardChunk([PLN_PICK_SAVED, PLN_PICK_NEW, '⬅️ Kembali'], 2)
    );
    ctx.session.digiStep = 'awaiting_pln_source';
};

const showSavedPlnChoices = async (ctx) => {
    const savedList = ctx.session.savedPlnOptions || [];

    if (savedList.length === 0) {
        await promptCustomerNumber(ctx, true);
        ctx.session.digiStep = 'awaiting_number';
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

    ctx.session.digiStep = 'awaiting_saved_pln_choice';
};

const buildTransactionSummary = (proses, ctx, statusEmoji, statusText) => {
    const productName = ctx.session.selectedProduct?.product_name;
    const lines = [];

    if (hasValue(productName)) {
        lines.push(`📦 <b>Produk:</b> ${escapeHtml(productName)}`);
    }

    lines.push(`🆔 <b>Ref ID:</b> <code>${escapeHtml(proses.ref_id || ctx.session.refId || '-')}</code>`);
    lines.push(`📱 <b>Nomor:</b> <code>${escapeHtml(proses.customer_no || ctx.session.customerNo || '-')}</code>`);
    if (hasValue(ctx.session.operatorInfo?.name)) {
        const operator = ctx.session.operatorInfo;
        const operatorLabel = operator.name ? operator.name.toString().toUpperCase() : '';
        const prefixText = hasValue(operator.prefix) ? ` (prefix ${escapeHtml(operator.prefix)})` : '';
        lines.push(`📡 <b>Operator:</b> ${operator.emoji || ''} <b>${escapeHtml(operatorLabel)}</b>${prefixText}`.trim());
    }
    lines.push(`🏷️ <b>SKU:</b> <code>${escapeHtml(proses.buyer_sku_code || ctx.session.sku || '-')}</code>`);
    lines.push(`💰 <b>Harga:</b> Rp ${formatCurrency(proses.price || ctx.session.selectedProduct?.price)}`);

    if (hasValue(proses.buyer_last_saldo)) {
        lines.push(`💼 <b>Saldo Akhir:</b> Rp ${formatCurrency(proses.buyer_last_saldo)}`);
    }

    if (hasValue(proses.sn)) {
        lines.push(`🎮 <b>Serial Number:</b> <code>${escapeHtml(proses.sn)}</code>`);
    }

    if (hasValue(proses.message)) {
        lines.push(`ℹ️ <b>Pesan:</b> ${escapeHtml(proses.message)}`);
    }

    return `${statusEmoji} <b>Transaksi ${statusText}</b>\n\n${lines.join('\n')}`;
};

const OPERATOR_DATA = [
    {
        name: 'Telkomsel',
        emoji: '🔴',
        prefixes: ['0811', '0812', '0813', '0821', '0822', '0823', '0852', '0853', '0851']
    },
    {
        name: 'Indosat Ooredoo',
        emoji: '🟡',
        prefixes: ['0814', '0815', '0816', '0855', '0856', '0857', '0858']
    },
    {
        name: 'XL Axiata',
        emoji: '🔵',
        prefixes: ['0859', '0877', '0878', '0817', '0818', '0819']
    },
    {
        name: '3 (Tri)',
        emoji: '⚫',
        prefixes: ['0898', '0899', '0895', '0896', '0897']
    },
    {
        name: 'Smartfren',
        emoji: '🟣',
        prefixes: ['0889', '0881', '0882', '0883', '0886', '0887', '0888', '0884', '0885']
    },
    {
        name: 'Axis',
        emoji: '🟢',
        prefixes: ['0832', '0833', '0838', '0831']
    },
];

const detectOperatorInfo = (normalizedNumber) => {
    if (!hasValue(normalizedNumber)) return null;
    const prefix = normalizedNumber.slice(0, 4);
    if (!prefix) return null;

    const match = OPERATOR_DATA.find((operator) => operator.prefixes.includes(prefix));
    if (!match) return null;

    return {
        name: match.name,
        emoji: match.emoji,
        prefix,
    };
};

const normalizeIndonesianPhoneNumber = (input) => {
    if (!hasValue(input)) {
        return { normalized: '', operator: null };
    }

    const digitsOnly = String(input).replace(/\D/g, '');
    if (!digitsOnly) {
        return { normalized: '', operator: null };
    }

    let normalized = digitsOnly;
    if (normalized.startsWith('62')) {
        normalized = normalized.slice(2);
    }
    if (!normalized.startsWith('0')) {
        normalized = `0${normalized}`;
    }

    const operator = detectOperatorInfo(normalized);
    return { normalized, operator };
};

const handleDigiflazzEnter = async (ctx, selectedProduct) => {
    const List = selectedProduct;
    const refId = await generateRefId('DF');
    ctx.session.sku = List.buyer_sku_code;
    ctx.session.refId = refId;
    ctx.session.selectedProduct = List;
    ctx.session.digiStep = 'awaiting_number';

    const statusPenjual = List.seller_product_status
        ? '✅ Penjual: <b>Aktif</b>'
        : '❌ Penjual: <b>Gangguan</b>';
    const statusPembeli = List.buyer_product_status
        ? '✅ Pembeli: <b>Aktif</b>'
        : '❌ Pembeli: <b>Gangguan</b>';

    let detail = `📦 <b>Detail Produk</b>\n\n`;
    detail += `🛒 <b>Nama:</b> ${escapeHtml(selectedProduct.product_name)}\n`;
    detail += `💰 <b>Harga:</b> Rp ${numberWithCommas(List.price)}\n`;
    detail += `🏷️ <b>SKU:</b> <code>${escapeHtml(List.buyer_sku_code)}</code>\n`;
    detail += `🏢 <b>Penjual:</b> ${escapeHtml(List.seller_name)}\n`;
    detail += `📊 <b>Status Produk</b>\n${statusPenjual}\n${statusPembeli}\n\n`;
    detail += `🆔 <b>Ref ID:</b> <code>${escapeHtml(refId)}</code>`;

    await ctx.replyWithHTML(detail);

    if (isPlnContext(ctx)) {
        try {
            ctx.session.savedPlnOptions = await getSavedPlnList({
                chatId: ctx.chat?.id,
            });
        } catch (error) {
            ctx.session.savedPlnOptions = [];
            console.error('Error loading saved PLN list:', error.message);
        }

        await promptPlnSource(ctx);
        return;
    }

    await ctx.reply('Masukkan nomor pelanggan:', showKeyboardChunk(["⬅️ Kembali"]));
};

// Function to create transaction log in new format
async function createTransactionLog(transactionData, user, source = "telegram_bot", productData = {}, context = {}) {
    try {
        const timestamp = new Date();
        
        const {
            ref_id,
            customer_no,
            buyer_sku_code,
            message,
            status,
            rc,
            sn,
            buyer_last_saldo,
            price,
            tele,
            wa
        } = transactionData;

        const parsedPrice = toNumeric(price);
        const parsedCostPrice = toNumeric(productData.price, parsedPrice);
        const productName = productData.product_name || 'Unknown Product';
        const buyerSkuCode = buyer_sku_code || productData.buyer_sku_code || productName;
        const categoryName = productData.category || 'Unknown Category';
        const brandName = productData.brand || 'Unknown Brand';
        
        const baseCustomer = context?.customerNo || customer_no || '-';
        const infoParts = [];

        if (context?.operatorInfo?.name) {
            infoParts.push(context.operatorInfo.name.toString().toUpperCase());
        }

        if (context?.ffNickname) {
            infoParts.push(`FF: ${context.ffNickname}`);
        }

        if (context?.mlNickname) {
            const country = context?.mlCountry ? ` (${context.mlCountry})` : '';
            infoParts.push(`ML: ${context.mlNickname}${country}`);
        }

        if (context?.plnVerification?.name) {
            infoParts.push(`PLN: ${context.plnVerification.name}`);
        }

        return upsertTransactionLog({
            id: ref_id,
            provider: 'digiflazz',
            user,
            source,
            status,
            message,
            serialNumber: sn,
            productName,
            buyerSkuCode,
            originalCustomerNo: baseCustomer,
            categoryName,
            brandName,
            providerTransactionId: rc,
            costPrice: parsedCostPrice,
            sellingPrice: parsedPrice,
            detailParts: infoParts,
            timestamp,
        });
    } catch (error) {
        console.error("Error creating transaction log:", error);
        // Don't throw error to avoid breaking main flow
        return null;
    }
}

const handleDigiflazzMessage = async (ctx, message) => {
    if (message === PLN_PICK_BACK && isPlnContext(ctx)) {
        await promptPlnSource(ctx);
        return;
    }

    // Allow user to go back
    if (message === "⬅️ Kembali") {
        ctx.scene.enter(SCENE_KEYS.PRODUCT);
        return;
    }

    const step = ctx.session.digiStep || 'awaiting_number';

    if (step === 'awaiting_pln_source') {
        const pickSaved = message === PLN_PICK_SAVED || /^1$/.test(message) || /database/i.test(message);
        const pickNew = message === PLN_PICK_NEW || /^2$/.test(message) || /baru/i.test(message);

        if (pickSaved) {
            await showSavedPlnChoices(ctx);
            return;
        }

        if (pickNew) {
            ctx.session.plnVerification = null;
            ctx.session.customerNo = null;
            await promptCustomerNumber(ctx, true);
            ctx.session.digiStep = 'awaiting_number';
            return;
        }

        ctx.session.plnVerification = null;
        ctx.session.customerNo = message.trim();
        ctx.session.customerNoOriginal = message.trim();
        ctx.session.digiStep = 'awaiting_number';
        await handleDigiflazzMessage(ctx, message.trim());
        return;
    }

    if (step === 'awaiting_saved_pln_choice') {
        if (message === PLN_PICK_NEW) {
            ctx.session.plnVerification = null;
            ctx.session.customerNo = null;
            await promptCustomerNumber(ctx, true);
            ctx.session.digiStep = 'awaiting_number';
            return;
        }

        if (!/^\d+$/.test(message)) {
            await ctx.reply(
                'Ketik nomor daftar ID PLN yang tersedia atau pilih input ID baru.',
                showKeyboardChunk([PLN_PICK_NEW, PLN_PICK_BACK, '⬅️ Kembali'], 2)
            );
            return;
        }

        const selectedIndex = Number(message) - 1;
        const selectedPln = (ctx.session.savedPlnOptions || [])[selectedIndex];

        if (!selectedPln) {
            await ctx.reply(
                'Nomor daftar ID PLN tidak valid.',
                showKeyboardChunk([PLN_PICK_NEW, PLN_PICK_BACK, '⬅️ Kembali'], 2)
            );
            return;
        }

        ctx.session.customerNoOriginal = selectedPln.customerNo;
        ctx.session.customerNo = selectedPln.customerNo;
        ctx.session.operatorInfo = null;
        ctx.session.plnVerification = mapSavedPlnToVerification(selectedPln);

        const extraLines = ['Sumber: Database tersimpan'];
        const verifiedAt = formatDateTime(selectedPln.lastVerifiedAt);
        if (verifiedAt) {
            extraLines.push(`Terakhir validasi: ${verifiedAt}`);
        }

        await sendConfirmationPrompt(
            ctx,
            buildPlnVerificationBlock(ctx.session.plnVerification, extraLines)
        );
        return;
    }

    if (step === 'awaiting_number') {
        const rawInput = message.trim();
        const p = ctx.session.selectedProduct || {};
        const categoryText = (ctx.session.selectedCategory || p.category || '').toString().toLowerCase();
        const isPulsaData = categoryText.includes('pulsa') || categoryText.includes('data');

        let normalizedNumber = rawInput;
        let operatorInfo = null;
        if (isPulsaData) {
            const { normalized, operator } = normalizeIndonesianPhoneNumber(rawInput);
            if (hasValue(normalized)) {
                normalizedNumber = normalized;
            }
            operatorInfo = operator;
        }

        ctx.session.customerNoOriginal = rawInput;
        ctx.session.customerNo = normalizedNumber;
        ctx.session.operatorInfo = operatorInfo;

        const isPLN = isPlnContext(ctx);

        let verifyBlock = '';
        if (isPLN) {
            try {
                const cachedPln = await findSavedPlnByCustomerNo({
                    chatId: ctx.chat?.id,
                    customerNo: ctx.session.customerNo,
                });

                if (cachedPln) {
                    ctx.session.plnVerification = mapSavedPlnToVerification(cachedPln);
                    const extraLines = ['Sumber: Database tersimpan'];
                    const verifiedAt = formatDateTime(cachedPln.lastVerifiedAt);
                    if (verifiedAt) {
                        extraLines.push(`Terakhir validasi: ${verifiedAt}`);
                    }
                    verifyBlock += buildPlnVerificationBlock(ctx.session.plnVerification, extraLines);
                } else {
                    const v = await pln(ctx.session.customerNo);
                    if (v && v.status === 'Sukses') {
                        ctx.session.plnVerification = {
                            name: v.name,
                            meter_no: v.meter_no,
                            subscriber_id: v.subscriber_id,
                            segment_power: v.segment_power,
                        };
                        verifyBlock += buildPlnVerificationBlock(ctx.session.plnVerification, ['Sumber: Validasi Digiflazz']);

                        try {
                            await saveVerifiedPln({
                                chatId: ctx.chat?.id,
                                username: ctx.from?.username || ctx.from?.id?.toString(),
                                customerNo: ctx.session.customerNo,
                                verification: ctx.session.plnVerification,
                                source: 'digiflazz_validation',
                                refId: ctx.session.refId,
                                productName: ctx.session.selectedProduct?.product_name,
                            });
                        } catch (saveError) {
                            console.error('Error saving PLN verification cache:', saveError.message);
                        }
                    } else {
                        // Lanjutkan transaksi dengan peringatan jika verifikasi gagal
                        ctx.session.plnVerification = null;
                        verifyBlock += `⚠️ <b>Verifikasi PLN</b>\n`;
                        verifyBlock += `• Status: <i>Gagal</i> — ${escapeHtml(v?.message || 'Data tidak valid')}\n`;
                        verifyBlock += `• Transaksi dapat dilanjutkan, nomor belum tervalidasi\n`;
                    }
                }
            } catch (err) {
                // Lanjutkan transaksi dengan peringatan jika server verifikasi gangguan
                ctx.session.plnVerification = null;
                verifyBlock += `⚠️ <b>Verifikasi PLN</b>\n`;
                verifyBlock += `• Status: <i>Gangguan server</i>\n`;
                verifyBlock += `• Pesan: <i>${escapeHtml(err.message || 'Tidak diketahui')}</i>\n`;
                verifyBlock += `• Transaksi dapat dilanjutkan, nomor belum tervalidasi\n`;
            }
        }

        // Free Fire nickname verification (based on product name)
        const name = (p.product_name || '').toString().toLowerCase();
        if (name.includes('free fire')) {
            try {
                const res = await inquireFFNickname(ctx.session.customerNo);
                if (res?.isSuccess && res?.nickname) {
                    ctx.session.ffNickname = res.nickname;
                    verifyBlock += `\n🕹️ <b>Verifikasi Free Fire</b>\n`;
                    verifyBlock += `• Nickname: <b>${escapeHtml(res.nickname)}</b>\n`;
                } else {
                    ctx.session.ffNickname = null;
                    verifyBlock += `\n⚠️ <b>Verifikasi Free Fire</b>\n`;
                    verifyBlock += `• Status: <i>${escapeHtml(res?.message || 'Tidak tervalidasi')}</i>\n`;
                    verifyBlock += `• Transaksi dapat dilanjutkan (server verifikasi mungkin gangguan)\n`;
                }
            } catch (e) {
                ctx.session.ffNickname = null;
                verifyBlock += `\n⚠️ <b>Verifikasi Free Fire</b>\n`;
                verifyBlock += `• Status: <i>Gangguan</i>\n`;
                verifyBlock += `• Pesan: <i>${escapeHtml(e.message || 'Tidak diketahui')}</i>\n`;
                verifyBlock += `• Transaksi dapat dilanjutkan\n`;
            }
        }

        await sendConfirmationPrompt(ctx, verifyBlock);
        return;
    }

    if (step === 'awaiting_confirm') {
        if (/^✅ Setuju$/i.test(message) || /^ya$/i.test(message)) {
            if (isPlnContext(ctx) && ctx.session.plnVerification?.name) {
                try {
                    await saveVerifiedPln({
                        chatId: ctx.chat?.id,
                        username: ctx.from?.username || ctx.from?.id?.toString(),
                        customerNo: ctx.session.customerNo,
                        verification: ctx.session.plnVerification,
                        source: 'digiflazz_transaction',
                        refId: ctx.session.refId,
                        productName: ctx.session.selectedProduct?.product_name,
                    });
                } catch (saveError) {
                    console.error('Error saving PLN verification from Digiflazz flow:', saveError.message);
                }
            }

            // Proses langsung tanpa PIN
            const proses = await performTransaction(ctx.session.refId, ctx.session.sku, ctx.session.customerNo);

            let statusEmoji;
            let statusText;

            if (proses.status === "Gagal") {
                statusEmoji = '❌';
                statusText = 'Gagal';
            } else if (proses.status === "Sukses") {
                statusEmoji = '✅';
                statusText = 'Sukses';
            } else if (proses.status === "Pending") {
                statusEmoji = '⏳';
                statusText = 'Pending';
            } else {
                statusEmoji = '⚠️';
                statusText = 'Tidak Diketahui';
            }

            const text = buildTransactionSummary(proses, ctx, statusEmoji, statusText);

            const username = ctx.message.from.username || ctx.message.from.id.toString();
            await createTransactionLog(proses, username, "telegram_bot", ctx.session.selectedProduct, ctx.session);

            await ctx.replyWithHTML(text);
            resetSessionForBot(ctx, 'Digiflazz');
            ctx.scene.enter(SCENE_KEYS.CATEGORY);
            return;
        }

        // Cancel flow
        await ctx.reply('Transaksi dibatalkan. Kembali ke kategori.');
        resetSessionForBot(ctx, 'Digiflazz');
        ctx.scene.enter(SCENE_KEYS.CATEGORY);
        return;
    }

};

module.exports = {
    handleDigiflazzEnter,
    handleDigiflazzMessage,
};
