const { Markup, Scenes } = require('telegraf');
const SCENE_KEYS = require('../constants/sceneKeys');
const { showKeyboardChunk } = require('../services/keyboard');
const { resetSessionForBot } = require('../utils/sessionState');
const { safeText } = require('../utils/sanitize');

const BOT_MENU = [
    "Digiflazz",
    "TokoVoucher",
];

const botMenu = new Scenes.BaseScene(SCENE_KEYS.BOT);
botMenu.enter((ctx) => {
    ctx.reply('Silahkan Pilih Bot', showKeyboardChunk(BOT_MENU));
});

botMenu.on('text', (ctx) => {
    const selectedBot = safeText(ctx);
    switch (selectedBot) {
        case 'Digiflazz':
            resetSessionForBot(ctx, selectedBot);
            ctx.scene.enter(SCENE_KEYS.CATEGORY);
            break;
        case 'TokoVoucher':
            resetSessionForBot(ctx, selectedBot);
            ctx.scene.enter(SCENE_KEYS.CATEGORY);
            break;
        default:
            ctx.reply('Maaf, Pilihan Belum tersedia');
            break;
    }
});

module.exports = botMenu;
