const { showKeyboardChunk, splitList } = require('../../services/keyboard');
const { numberWithCommas } = require('../../utils/formatters');
const { getListJenis } = require('../../services/http_toko');
const SCENE_KEYS = require('../../constants/sceneKeys');

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatCurrency = (amount) => {
    if (amount === null || amount === undefined || amount === '') return '0';
    const numeric = Number(amount);
    if (Number.isNaN(numeric)) return '0';
    return numberWithCommas(numeric);
};

const handleTokoVoucherEnter = async (ctx, selectedProduct) => {
    const id_jenis = selectedProduct.id;
    const listJenis = await getListJenis(id_jenis);
    ctx.session.listJenis = listJenis;

    const chunkSize = 10; // Reduced for better mobile display
    const chunks = splitList(listJenis, chunkSize);
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const startIndex = i * chunkSize;
        const header = chunks.length > 1
            ? `📦 <b>Daftar Produk</b> — Halaman ${i + 1}/${chunks.length}`
            : `📦 <b>Daftar Produk</b>`;

        const itemsText = chunk.map((item, index) => {
            const num = (startIndex + index + 1).toString().padStart(2, '0');
            const status = item.status ? '✅' : '⚠️';
            const price = formatCurrency(item.price);
            return `${num}. ${status} <b>${escapeHtml(item.nama_produk)}</b>\nRp ${price}`;
        }).join('\n\n');

        const footer = `\n\n📝 Ketik nomor untuk memilih produk`;
        await ctx.replyWithHTML(`${header}\n\n${itemsText}${footer}`, showKeyboardChunk(['⬅️ Kembali']));
    }
};

const handleTokoVoucherMessage = async (ctx, message) => {
    if (Number(message)) {
        if (ctx.session.listJenis[message - 1]) {
            ctx.session.selectedProduct = ctx.session.listJenis[message - 1];
            ctx.scene.enter(SCENE_KEYS.OPSI1);
        } else {
                                ctx.replyWithMarkdown(`❌ *Maaf!*
Pilihan yang Anda masukkan tidak tersedia.

💡 Silakan pilih nomor yang ada dalam daftar.`);
        }
    }
};

module.exports = {
    handleTokoVoucherEnter,
    handleTokoVoucherMessage
};
