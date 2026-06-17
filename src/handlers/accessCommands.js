const User = require('../models/mongoose');
const {
    ADMIN_ROLE,
    OWNER_ROLE,
    USER_ROLE,
    canAccessBot,
    escapeHtml,
    findOrCreateUser,
    isManager,
} = require('../services/accessControl');

function parseCommand(text = '') {
    const parts = text.trim().split(/\s+/);
    return {
        command: (parts[0] || '').toLowerCase(),
        arg: parts[1] ? String(parts[1]).trim() : '',
    };
}

function userRole(user) {
    return user.role || USER_ROLE;
}

function userLabel(user) {
    const username = user.username ? `@${user.username}` : '-';
    const access = canAccessBot(user) ? 'diizinkan' : 'pending';
    return `<code>${escapeHtml(user.chatId)}</code> — ${escapeHtml(username)} — ${escapeHtml(userRole(user))} — ${access}`;
}

async function requireManager(ctx, actor) {
    if (isManager(actor)) return true;
    await ctx.reply('Perintah ini hanya untuk owner/admin.');
    return false;
}

async function requireOwner(ctx, actor) {
    if (actor?.role === OWNER_ROLE) return true;
    await ctx.reply('Perintah ini hanya untuk owner.');
    return false;
}

async function findTarget(ctx, chatId) {
    if (!chatId) {
        await ctx.reply('Format: gunakan chat ID target setelah perintah. Contoh: /approve 123456789');
        return null;
    }

    const target = await User.findOne({ chatId: String(chatId) });
    if (!target) {
        await ctx.replyWithHTML(`User <code>${escapeHtml(chatId)}</code> belum ada. Minta user kirim /start ke bot dulu.`);
        return null;
    }

    return target;
}

async function showMe(ctx, actor) {
    const access = canAccessBot(actor) ? 'Diizinkan' : 'Pending';
    await ctx.replyWithHTML(
        `👤 <b>Status Akses</b>\n\n` +
        `Chat ID: <code>${escapeHtml(actor.chatId)}</code>\n` +
        `Username: ${escapeHtml(actor.username ? `@${actor.username}` : '-')}\n` +
        `Role: <b>${escapeHtml(actor.role || USER_ROLE)}</b>\n` +
        `Akses: <b>${access}</b>`
    );
}

async function listUsers(ctx, actor) {
    if (!(await requireManager(ctx, actor))) return;

    const users = await User.find().sort({ role: 1, isPremium: 1, createdAt: -1 }).limit(40).lean();
    if (users.length === 0) {
        await ctx.reply('Belum ada user.');
        return;
    }

    const owners = users.filter((user) => userRole(user) === OWNER_ROLE);
    const admins = users.filter((user) => userRole(user) === ADMIN_ROLE);
    const approved = users.filter((user) => userRole(user) === USER_ROLE && user.isPremium === true);
    const pending = users.filter((user) => userRole(user) === USER_ROLE && user.isPremium !== true);

    const sections = [
        ['Owner', owners],
        ['Admin', admins],
        ['Approved User', approved],
        ['Pending User', pending],
    ];

    const lines = ['👥 <b>Daftar User</b>'];
    sections.forEach(([title, items]) => {
        if (items.length === 0) return;
        lines.push(`\n<b>${title}</b>`);
        items.forEach((user) => lines.push(userLabel(user)));
    });

    await ctx.replyWithHTML(lines.join('\n'));
}

async function approveUser(ctx, actor, chatId) {
    if (!(await requireManager(ctx, actor))) return;
    const target = await findTarget(ctx, chatId);
    if (!target) return;

    if (target.role === OWNER_ROLE) {
        await ctx.reply('Owner sudah selalu punya akses.');
        return;
    }
    if (actor.role !== OWNER_ROLE && target.role === ADMIN_ROLE) {
        await ctx.reply('Admin tidak bisa mengubah akses admin lain.');
        return;
    }

    target.role = target.role || USER_ROLE;
    target.isPremium = true;
    target.deniedAt = null;
    target.deniedBy = null;
    target.approvedAt = new Date();
    target.approvedBy = actor.chatId;
    await target.save();

    await ctx.replyWithHTML(`Akses user <code>${escapeHtml(target.chatId)}</code> sudah diizinkan.`);
}

async function denyUser(ctx, actor, chatId) {
    if (!(await requireManager(ctx, actor))) return;
    const target = await findTarget(ctx, chatId);
    if (!target) return;

    if (target.role === OWNER_ROLE) {
        await ctx.reply('Owner tidak bisa di-deny.');
        return;
    }
    if (actor.role !== OWNER_ROLE && target.role === ADMIN_ROLE) {
        await ctx.reply('Admin tidak bisa deny admin lain.');
        return;
    }

    target.role = target.role || USER_ROLE;
    target.isPremium = false;
    target.deniedAt = new Date();
    target.deniedBy = actor.chatId;
    await target.save();

    await ctx.replyWithHTML(`Akses user <code>${escapeHtml(target.chatId)}</code> sudah dicabut.`);
}

async function promoteUser(ctx, actor, chatId) {
    if (!(await requireOwner(ctx, actor))) return;
    const target = await findTarget(ctx, chatId);
    if (!target) return;

    if (target.role === OWNER_ROLE) {
        await ctx.reply('User ini sudah owner.');
        return;
    }

    target.role = ADMIN_ROLE;
    target.isPremium = true;
    target.approvedAt = target.approvedAt || new Date();
    target.approvedBy = target.approvedBy || actor.chatId;
    await target.save();

    await ctx.replyWithHTML(`User <code>${escapeHtml(target.chatId)}</code> sekarang admin.`);
}

async function demoteUser(ctx, actor, chatId) {
    if (!(await requireOwner(ctx, actor))) return;
    const target = await findTarget(ctx, chatId);
    if (!target) return;

    if (target.role === OWNER_ROLE) {
        await ctx.reply('Owner tidak bisa di-demote.');
        return;
    }

    target.role = USER_ROLE;
    target.isPremium = true;
    await target.save();

    await ctx.replyWithHTML(`User <code>${escapeHtml(target.chatId)}</code> sekarang user biasa dan tetap diizinkan.`);
}

async function deleteUser(ctx, actor, chatId) {
    if (!(await requireManager(ctx, actor))) return;
    const target = await findTarget(ctx, chatId);
    if (!target) return;

    if (target.chatId === actor.chatId) {
        await ctx.reply('Anda tidak bisa menghapus data akses sendiri.');
        return;
    }
    if (target.role === OWNER_ROLE) {
        await ctx.reply('Owner tidak bisa dihapus.');
        return;
    }
    if (actor.role !== OWNER_ROLE && target.role === ADMIN_ROLE) {
        await ctx.reply('Admin tidak bisa menghapus admin lain.');
        return;
    }

    await User.deleteOne({ _id: target._id });
    await ctx.replyWithHTML(`Data user <code>${escapeHtml(target.chatId)}</code> sudah dihapus.`);
}

async function accessCommandMiddleware(ctx, next) {
    const text = ctx.message?.text;
    if (typeof text !== 'string') return next();

    const { command, arg } = parseCommand(text);
    const accessCommands = new Set(['/me', '/users', '/approve', '/deny', '/promote', '/demote', '/deleteuser']);
    if (!accessCommands.has(command)) return next();

    try {
        const actor = await findOrCreateUser(ctx);
        if (!actor) return next();

        if (command === '/me') return showMe(ctx, actor);
        if (command === '/users') return listUsers(ctx, actor);
        if (command === '/approve') return approveUser(ctx, actor, arg);
        if (command === '/deny') return denyUser(ctx, actor, arg);
        if (command === '/promote') return promoteUser(ctx, actor, arg);
        if (command === '/demote') return demoteUser(ctx, actor, arg);
        if (command === '/deleteuser') return deleteUser(ctx, actor, arg);
    } catch (error) {
        console.error('Access command error:', error?.message || error);
        return ctx.reply('Terjadi kesalahan saat memproses perintah akses.');
    }

    return next();
}

module.exports = {
    accessCommandMiddleware,
};
