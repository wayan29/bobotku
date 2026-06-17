const User = require('../models/mongoose');

const OWNER_ROLE = 'owner';
const ADMIN_ROLE = 'admin';
const USER_ROLE = 'user';

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getChatId(ctx) {
    const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id || ctx.message?.chat?.id;
    return chatId === undefined || chatId === null ? null : String(chatId);
}

function getUsername(ctx) {
    return ctx.from?.username || ctx.from?.id?.toString() || 'telegram_user';
}

function configuredOwnerChatId() {
    const value = process.env.OWNER_CHAT_ID;
    return value && String(value).trim() ? String(value).trim() : null;
}

function isManager(user) {
    return user?.role === OWNER_ROLE || user?.role === ADMIN_ROLE;
}

function canAccessBot(user) {
    return isManager(user) || user?.isPremium === true;
}

async function ownerExists() {
    const owner = await User.findOne({ role: OWNER_ROLE }).select({ _id: 1 }).lean();
    return Boolean(owner);
}

async function findOrCreateUser(ctx) {
    const chatId = getChatId(ctx);
    if (!chatId) return null;

    const username = getUsername(ctx);
    const ownerChatId = configuredOwnerChatId();
    const shouldBeConfiguredOwner = ownerChatId === chatId;

    let user = await User.findOne({ chatId });
    if (user) {
        let changed = false;
        if (user.username !== username) {
            user.username = username;
            changed = true;
        }
        if (shouldBeConfiguredOwner && (user.role !== OWNER_ROLE || user.isPremium !== true)) {
            user.role = OWNER_ROLE;
            user.isPremium = true;
            user.approvedAt = user.approvedAt || new Date();
            user.approvedBy = user.approvedBy || 'env:OWNER_CHAT_ID';
            changed = true;
        }
        if (changed) await user.save();
        return user;
    }

    const hasOwner = await ownerExists();
    const shouldBootstrapOwner = shouldBeConfiguredOwner || !hasOwner;

    user = new User({
        chatId,
        username,
        role: shouldBootstrapOwner ? OWNER_ROLE : USER_ROLE,
        isPremium: shouldBootstrapOwner,
        approvedAt: shouldBootstrapOwner ? new Date() : null,
        approvedBy: shouldBootstrapOwner
            ? (shouldBeConfiguredOwner ? 'env:OWNER_CHAT_ID' : 'bootstrap:first_user')
            : null,
    });
    await user.save();
    return user;
}

module.exports = {
    OWNER_ROLE,
    ADMIN_ROLE,
    USER_ROLE,
    escapeHtml,
    getChatId,
    getUsername,
    configuredOwnerChatId,
    isManager,
    canAccessBot,
    findOrCreateUser,
};
