const telegraf = require('telegraf');
const SCENE_KEYS = require('../constants/sceneKeys');
const { showKeyboardChunk } = require('../services/keyboard');
const { getListProductDigi, checkSaldoDigi } = require('../services/http');
const { getKategori, checkSaldo, numberWithCommas } = require('../services/http_toko');
const { resetSessionForBot } = require('../utils/sessionState');
const { safeText } = require('../utils/sanitize');

const botMenu = new telegraf.Scenes.BaseScene(SCENE_KEYS.CATEGORY);
botMenu.enter(async (ctx) => {
    const selectedBot = ctx.session.selectedBot;

    if (!selectedBot) {
        ctx.scene.enter(SCENE_KEYS.BOT);
        return;
    }

    let saldoText;
    let listText;

    if (selectedBot === 'Digiflazz') {
        try {
            // Always force refresh when Digiflazz is selected
            const listdigiflazz = await getListProductDigi(true);
            ctx.session.digiflazzCategories = listdigiflazz;
            if (listdigiflazz.length === 0) {
                await ctx.reply('⚠️ Tidak dapat mengambil data kategori produk. Silakan coba beberapa saat lagi.');
                return ctx.scene.enter(SCENE_KEYS.BOT);
            }
            saldoText = `💰 <b>Saldo</b>: Rp ${numberWithCommas(await checkSaldoDigi())}\n\n`;
            listText = `📂 <b>Pilih Kategori</b>\n\n` + listdigiflazz
                .map((item, index) => `${(index + 1).toString().padStart(2,'0')}. ${item}`)
                .join('\n');
        } catch (error) {
            await ctx.reply(`❌ ${error.message}`);
            return ctx.scene.enter(SCENE_KEYS.BOT);
        }
    } else if (selectedBot === 'TokoVoucher') {
        const listTokoVoucher = await getKategori();
        ctx.session.tokoVoucherCategories = listTokoVoucher;
        saldoText = `💰 <b>Saldo</b>: Rp ${numberWithCommas(await checkSaldo())}\n\n`;
        listText = `📂 <b>Pilih Kategori</b>\n\n` + listTokoVoucher
            .map((item, index) => `${(index + 1).toString().padStart(2,'0')}. ${item.nama}`)
            .join('\n');
    }
    
    await ctx.replyWithHTML(saldoText + listText, showKeyboardChunk(['⬅️ Kembali']));

});

botMenu.on('text', async (ctx) => {
    const selectedBot = ctx.session.selectedBot;
    const selectedCategory = safeText(ctx);

    if (selectedCategory === '⬅️ Kembali') {
        resetSessionForBot(ctx);
        ctx.scene.enter(SCENE_KEYS.BOT);
        return;
    }

    if (selectedBot === 'Digiflazz') {
        const listdigiflazz = ctx.session.digiflazzCategories;
        if (!listdigiflazz) {
            await ctx.reply('⚠️ Data kategori tidak tersedia. Memuat ulang...');
            return ctx.scene.reenter();
        }
        if (!isNaN(selectedCategory)) {
            const selectedIndex = parseInt(selectedCategory) - 1;
            if (listdigiflazz[selectedIndex]) {
                ctx.session.selectedCategory = listdigiflazz[selectedIndex];
                ctx.scene.enter(SCENE_KEYS.BRAND);
            } else {
                return ctx.reply('❌ Pilihan tidak tersedia. Silakan pilih nomor yang valid.');
            }
        } else {
            return ctx.reply('❗ Input harus berupa nomor. Silakan pilih nomor kategori.');
        }
    } else if (selectedBot === 'TokoVoucher') {
        const listTokoVoucher = ctx.session.tokoVoucherCategories;
        if (!listTokoVoucher) {
            await ctx.reply('⚠️ Data kategori tidak tersedia. Memuat ulang...');
            return ctx.scene.reenter();
        }
        if (!isNaN(selectedCategory)) {
            const selectedIndex = parseInt(selectedCategory) - 1;
             if (listTokoVoucher[selectedIndex]) {
                ctx.session.selectedCategory = listTokoVoucher[selectedIndex];
                ctx.scene.enter(SCENE_KEYS.BRAND);
            } else {
               return ctx.reply('❌ Pilihan tidak tersedia. Silakan pilih nomor yang valid.');
           }
       } else {
         return ctx.reply('❗ Input harus berupa nomor. Silakan pilih nomor kategori.');
        }
    }
});

module.exports = botMenu;
