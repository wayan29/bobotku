const { Telegraf, session, Scenes } = require('telegraf');
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Environment variables loaded silently
const botMenu = require('./scenes/botMenu');
const selectCategory = require('./scenes/selectCategory');
const selectBrand = require('./scenes/selectBrand');
const selectProduct = require('./scenes/selectProduct');
const productDetail = require('./scenes/productDetail');
const enterDestinationNumber = require('./scenes/enterDestinationNumber');
const enterServerId = require('./scenes/enterServerId');
const SCENE_KEYS = require('./constants/sceneKeys');
const { helpMiddleware, premiumAccessMiddleware } = require('./handlers/globalMiddleware');
const { accessCommandMiddleware } = require('./handlers/accessCommands');
const checkOperator = require('./middleware/Checkop');
const rateLimitCommands = require('./middleware/rateLimitCommands');
const mongoose = require('mongoose');
const { checkStatus, GetAll, checkTovStatus } = require('./middleware/CheckTOV');
const { getAllDigiflazz, checkDigiflazz } = require('./middleware/Digiflazz');
const { createReceiptCommandMiddleware } = require('./handlers/receiptCommand');
const { handleTransactionsCommand } = require('./handlers/transactionsCommand');
const {
    checkPln,
    checkFF,
    checkML,
    reloadDigiflazzPricelist,
} = require('./handlers/utilityCommands');
const { resetSessionForBot } = require('./utils/sessionState');
const { handleProviderWebhook } = require('./services/providerWebhooks');

const dbURL = process.env.MONGO_URL;
mongoose.connect(dbURL)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));

const listStage = [
    botMenu,
    selectCategory,
    selectBrand,
    selectProduct,
    productDetail,
    enterDestinationNumber,
    enterServerId
]

const bot = new Telegraf(process.env.TOKEN);
const stage = new Scenes.Stage(listStage);

// session() must be registered before any middleware that reads/writes ctx.session
bot.use(session());

bot.use(helpMiddleware);
bot.use(accessCommandMiddleware);
bot.use(premiumAccessMiddleware);
bot.use(rateLimitCommands);

bot.use(checkStatus);
bot.use(checkDigiflazz);
bot.use(GetAll);
bot.use(getAllDigiflazz);
bot.use(checkPln);
bot.use(checkFF);
bot.use(checkML);
bot.use(reloadDigiflazzPricelist);
bot.use(checkOperator);

// Intercept /struk and price input before scenes so it works anywhere
bot.use(createReceiptCommandMiddleware({ checkTovStatus }));

bot.use(stage.middleware());

bot.command('start', (ctx) => ctx.scene.enter(SCENE_KEYS.BOT));

bot.command('transactions', handleTransactionsCommand);


bot.on('text', (ctx) => {
    resetSessionForBot(ctx);
    ctx.scene.enter(SCENE_KEYS.BOT);

    
});



let httpServer = null;

function startProviderWebhookServer(port) {
    httpServer = http.createServer(async (req, res) => {
        if (await handleProviderWebhook(req, res, { bot })) return;
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    });

    httpServer.listen(port, () => {
        console.log(`Provider webhook server listening on port ${port}`);
    });
}

if (process.env.NODE_ENV === 'production') {
    const port = Number(process.env.PORT || 3000);
    const webhookPath = process.env.TELEGRAM_WEBHOOK_PATH || `/telegraf/${bot.secretPathComponent()}`;
    const telegramWebhook = bot.webhookCallback(webhookPath);

    httpServer = http.createServer(async (req, res) => {
        if (await handleProviderWebhook(req, res, { bot })) return;
        return telegramWebhook(req, res);
    });

    httpServer.listen(port, async () => {
        const domain = (process.env.HEROKU_URL || '').replace(/\/+$/, '');
        if (!domain) {
            console.error('HEROKU_URL is required in production webhook mode');
            return;
        }
        await bot.telegram.setWebhook(`${domain}${webhookPath}`);
        console.log(`Webhook server listening on port ${port}`);
    });
} else {
    bot.launch();
    if (process.env.ENABLE_PROVIDER_WEBHOOKS === '1') {
        startProviderWebhookServer(Number(process.env.PORT || 3000));
    }
}

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`Received ${signal}, shutting down...`);
    bot.stop(signal);
    if (httpServer) httpServer.close(() => console.log('HTTP server closed'));
    mongoose.connection.close(false).finally(() => process.exit(0));
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
