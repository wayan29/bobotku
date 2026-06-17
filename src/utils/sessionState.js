const FLOW_STATE_KEYS = [
    'selectedCategory',
    'selectedBrand',
    'selectedProduct',
    'MenuPrice',
    'listJenis',
    'list',
    'codeList',
    'serverId',
    'nomorTujuan',
    'customerNo',
    'customerNoOriginal',
    'refId',
    'digiStep',
    'tovStep',
    'savedPlnOptions',
    'plnVerification',
    'operatorInfo',
    'requiresOperatorInfo',
    'ffNickname',
    'mlNickname',
    'mlCountry',
    'productOptions',
    'brandOptions',
    'digiflazzCategories',
    'tokoVoucherCategories',
    'tovInputStep',
    'id_operator',
    'sku',
];

function ensureSession(ctx) {
    if (!ctx.session) {
        ctx.session = {};
    }

    return ctx.session;
}

function clearFlowState(ctx, options = {}) {
    const session = ensureSession(ctx);
    const { preservePendingReceipt = true } = options;

    FLOW_STATE_KEYS.forEach((key) => {
        delete session[key];
    });

    if (!preservePendingReceipt) {
        delete session.pendingReceipt;
    }

    return session;
}

function resetSessionForBot(ctx, selectedBot, options = {}) {
    const session = clearFlowState(ctx, options);
    if (selectedBot) {
        session.selectedBot = selectedBot;
    } else {
        delete session.selectedBot;
    }
    return session;
}

module.exports = {
    clearFlowState,
    resetSessionForBot,
};
