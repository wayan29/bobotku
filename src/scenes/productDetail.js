const telegraf = require('telegraf');
const SCENE_KEYS = require('../constants/sceneKeys');
const { handleDigiflazzEnter, handleDigiflazzMessage } = require('./providers/digiflazz');
const { handleTokoVoucherEnter, handleTokoVoucherMessage } = require('./providers/tokovoucher');
const { safeText } = require('../utils/sanitize');

const botMenu = new telegraf.Scenes.BaseScene(SCENE_KEYS.PRICE);

botMenu.enter(async (ctx) => {
    const selectedProduct = ctx.session.selectedBot === 'TokoVoucher' 
        ? ctx.session.MenuPrice 
        : ctx.session.selectedProduct;
    const BOT = ctx.session.selectedBot;

    if (BOT === 'Digiflazz') {
        await handleDigiflazzEnter(ctx, selectedProduct);
    } else if (BOT === 'TokoVoucher') {
        await handleTokoVoucherEnter(ctx, selectedProduct);
    }
});

botMenu.on('text', async (ctx) => {
    const pesan = safeText(ctx);
    if (pesan === "⬅️ Kembali") {
        ctx.scene.enter(SCENE_KEYS.PRODUCT);
        return;
    }

    const BOT = ctx.session.selectedBot;
    if (BOT === 'Digiflazz') {
        await handleDigiflazzMessage(ctx, pesan);
    } else if (BOT === 'TokoVoucher') {
        await handleTokoVoucherMessage(ctx, pesan);
    }
});

module.exports = botMenu;
