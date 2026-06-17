const TransactionLog = require('../models/transactionLog');

async function handleTransactionsCommand(ctx) {
    try {
        const logs = await TransactionLog.find().sort({ timestamp: -1 }).limit(10);

        if (logs.length === 0) {
            return ctx.replyWithHTML(`📊 <b>LOG TRANSAKSI</b>

❌ <i>Tidak ada log transaksi yang ditemukan</i>`);
        }

        let message = `📊 <b>LOG TRANSAKSI TERAKHIR</b>\n\n`;

        logs.forEach((log) => {
            const statusEmoji = log.status === 'Sukses' ? '✅'
                : log.status === 'Pending' ? '⏳'
                : log.status === 'Gagal' ? '❌'
                : '❓';

            message += `${statusEmoji} <b>${log.status}</b>\n`;
            message += `🆔 ID: <code>${log.id}</code>\n`;
            message += `📦 Produk: ${log.productName}\n`;
            message += `💰 Harga: Rp ${log.sellingPrice.toLocaleString('id-ID')}\n`;
            message += `🏪 Provider: ${log.provider}\n`;
            message += `📅 ${new Date(log.timestamp).toLocaleString('id-ID')}\n\n`;
        });

        message += '📝 Menampilkan 10 transaksi terakhir';

        await ctx.replyWithHTML(message);
    } catch (error) {
        console.error('Error fetching transaction logs:', error?.message || error);
        await ctx.replyWithHTML(`❌ <b>ERROR</b>\n\n<code>${error.message}</code>`);
    }
}

module.exports = {
    handleTransactionsCommand,
};
