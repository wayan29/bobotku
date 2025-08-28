const telegraf = require('telegraf');
const SCENE_KEYS = require('../constants/sceneKeys');
const { showKeyboardChunk } = require('../services/keyboard');
const { getListProductDigi, checkSaldoDigi } = require('../services/http');
const { getKategori, checkSaldo, numberWithCommas } = require('../services/http_toko');

let listdigiflazz;
let listTokoVoucher;

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
            listdigiflazz = await getListProductDigi(true);
            if (listdigiflazz.length === 0) {
                await ctx.reply('⚠️ Tidak dapat mengambil data kategori produk. Silakan coba beberapa saat lagi.');
                return ctx.scene.enter(SCENE_KEYS.BOT);
            }
            saldoText = `💰 Saldo Anda: Rp ${numberWithCommas(await checkSaldoDigi())}\n\n`;
            listText = "🗂️ *Silakan Pilih Kategori:*\n\n" + listdigiflazz.map((item, index) => `${index + 1}. ${item}`).join('\n');
        } catch (error) {
            await ctx.reply(`❌ ${error.message}`);
            return ctx.scene.enter(SCENE_KEYS.BOT);
        }
    } else if (selectedBot === 'TokoVoucher') {
        listTokoVoucher = await getKategori();
        saldoText = `💰 Saldo Anda: Rp ${numberWithCommas(await checkSaldo())}\n\n`;
        listText = "🗂️ *Silakan Pilih Kategori:*\n\n" + listTokoVoucher.map((item, index) => `${index + 1}. ${item.nama}`).join('\n');
    }
    
    await ctx.replyWithMarkdown(saldoText + listText, showKeyboardChunk(['⬅️ Kembali']));

});

botMenu.on('text', async (ctx) => {
    const selectedBot = ctx.session.selectedBot;
    const selectedCategory = ctx.message.text;

    if (selectedCategory === '⬅️ Kembali') {
        ctx.scene.enter(SCENE_KEYS.BOT);
        return;
    }

    if (selectedBot === 'Digiflazz') {
        if (!isNaN(selectedCategory)) {
            const selectedIndex = parseInt(selectedCategory) - 1;
            if (listdigiflazz[selectedIndex]) {
                ctx.session.selectedCategory = listdigiflazz[selectedIndex];
                ctx.scene.enter(SCENE_KEYS.BRAND);
            } else {
                return ctx.reply('Maaf, pilihan kategori tidak tersedia. Silakan pilih nomor yang valid.');
            }
        } else {
            return ctx.reply('Maaf, input harus berupa nomor. Silakan pilih nomor kategori.');
        }
    } else if (selectedBot === 'TokoVoucher') {
        if (!isNaN(selectedCategory)) {
            const selectedIndex = parseInt(selectedCategory) - 1;
             if (listTokoVoucher[selectedIndex]) {
                ctx.session.selectedCategory = listTokoVoucher[selectedIndex];
                ctx.scene.enter(SCENE_KEYS.BRAND);
            } else {
               return ctx.reply('Maaf, pilihan kategori tidak tersedia. Silakan pilih nomor yang valid.');
           }
       } else {
         return ctx.reply('Maaf, input harus berupa nomor. Silakan pilih nomor kategori.');
        }
    }
});

module.exports = botMenu;
