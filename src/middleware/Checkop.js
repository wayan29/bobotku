function checkOperator(phoneNumber) {
    const operators = {
        telkomsel: {
            name: "Telkomsel",
            emoji: "🔴",
            icon: "📱",
            prefixes: ["0811", "0812", "0813", "0821", "0822", "0823", "0852", "0853", "0851"],
            color: "🔴"
        },
        indosat: {
            name: "Indosat Ooredoo",
            emoji: "🟡",
            icon: "📞",
            prefixes: ["0814", "0815", "0816", "0855", "0856", "0857", "0858"],
            color: "🟡"
        },
        xl: {
            name: "XL Axiata",
            emoji: "🔵",
            icon: "📶",
            prefixes: ["0859", "0877", "0878", "0817", "0818", "0819"],
            color: "🔵"
        },
        tri: {
            name: "3 (Tri)",
            emoji: "⚫",
            icon: "🔘",
            prefixes: ["0898", "0899", "0895", "0896", "0897"],
            color: "⚫"
        },
        smartfren: {
            name: "Smartfren",
            emoji: "🟣",
            icon: "📈",
            prefixes: ["0889", "0881", "0882", "0883", "0886", "0887", "0888", "0884", "0885"],
            color: "🟣"
        },
        axis: {
            name: "Axis",
            emoji: "🟢",
            icon: "🎯",
            prefixes: ["0832", "0833", "0838", "0831"],
            color: "🟢"
        }
    };

    // Normalisasi nomor telepon
    let normalizedNumber = phoneNumber.replace(/\D/g, ''); // Hapus semua karakter non-digit
    
    // Konversi format +62 atau 62 ke 0
    if (normalizedNumber.startsWith('62')) {
        normalizedNumber = '0' + normalizedNumber.substring(2);
    }

    const prefix = normalizedNumber.substring(0, 4);

    // Cari operator berdasarkan prefix
    for (const [key, operator] of Object.entries(operators)) {
        if (operator.prefixes.includes(prefix)) {
            return {
                success: true,
                phoneNumber: normalizedNumber,
                originalNumber: phoneNumber,
                operator: operator.name,
                emoji: operator.emoji,
                icon: operator.icon,
                prefix: prefix
            };
        }
    }

    return {
        success: false,
        phoneNumber: normalizedNumber,
        originalNumber: phoneNumber
    };
}

const checkOp = (ctx, next) => {
    const text = ctx.message?.text || '';
    const match = text.match(/^\/(op|checkop)(?:\s+(.*))?$/);
    if (match) {
        const input = (match[2] || '').trim();
        
        // Jika tidak ada input, tampilkan panduan
        if (input === "") {
            const helpMessage = `
🔍 <b>CEK OPERATOR SELULER</b>

❌ <b>Format Salah!</b>

📝 <b>Cara Penggunaan:</b>
<code>/op [nomor_hp]</code>

💡 <b>Contoh:</b>
• <code>/op 081234567890</code>
• <code>/op +6281234567890</code>
• <code>/op 6281234567890</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 <b>Operator yang Didukung:</b>
🔴 Telkomsel
🟡 Indosat Ooredoo  
🔵 XL Axiata
⚫ 3 (Tri)
🟣 Smartfren
🟢 Axis

📱 <i>Bot akan otomatis mendeteksi operator dari nomor HP Anda</i>
            `;
            ctx.replyWithHTML(helpMessage);
            return;
        }

        try {
            const result = checkOperator(input);
            
            if (result.success) {
                const successMessage = `
✅ <b>OPERATOR BERHASIL DIDETEKSI</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 <b>Informasi Nomor:</b>

📞 <b>Nomor HP:</b> <code>${result.phoneNumber}</code>
🏢 <b>Operator:</b> ${result.emoji} <b>${result.operator}</b> ${result.icon}
🔢 <b>Prefix:</b> <code>${result.prefix}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ <i>Deteksi berhasil dilakukan!</i>
⏰ <i>Waktu: ${new Date().toLocaleString('id-ID')}</i>

💡 <i>Gunakan /op [nomor] untuk cek nomor lain</i>
                `;
                ctx.replyWithHTML(successMessage);
            } else {
                const errorMessage = `
❌ <b>OPERATOR TIDAK DIKENALI</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 <b>Nomor yang Dicek:</b> <code>${result.originalNumber}</code>
📞 <b>Nomor Ternormalisasi:</b> <code>${result.phoneNumber}</code>

⚠️ <b>Masalah:</b>
• Operator tidak dapat diidentifikasi
• Prefix nomor tidak terdaftar dalam database
• Kemungkinan nomor tidak valid

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 <b>Operator yang Didukung:</b>
🔴 <b>Telkomsel:</b> 0811, 0812, 0813, 0821, 0822, 0823, 0851, 0852, 0853
🟡 <b>Indosat:</b> 0814, 0815, 0816, 0855, 0856, 0857, 0858
🔵 <b>XL Axiata:</b> 0817, 0818, 0819, 0859, 0877, 0878
⚫ <b>3 (Tri):</b> 0895, 0896, 0897, 0898, 0899
🟣 <b>Smartfren:</b> 0881, 0882, 0883, 0884, 0885, 0886, 0887, 0888, 0889
🟢 <b>Axis:</b> 0831, 0832, 0833, 0838

💡 <b>Tips:</b>
• Pastikan nomor dimulai dengan 08xx
• Coba format: 081234567890
• Atau gunakan: +6281234567890
                `;
                ctx.replyWithHTML(errorMessage);
            }
        } catch (error) {
            const systemErrorMessage = `
🚨 <b>TERJADI KESALAHAN SISTEM</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ <b>Error Details:</b>
📱 <b>Input:</b> <code>${input}</code>
🔧 <b>Error:</b> <i>Kesalahan dalam memproses data</i>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 <b>Solusi:</b>
• Coba lagi dengan format yang benar
• Pastikan nomor HP valid
• Hubungi admin jika masalah berlanjut

📝 <b>Format yang Benar:</b>
<code>/op 081234567890</code>

⏰ <i>Error Time: ${new Date().toLocaleString('id-ID')}</i>
            `;
            ctx.replyWithHTML(systemErrorMessage);
        }
    } else {
        next();
    }
}

module.exports = checkOp;
module.exports.checkOperator = checkOperator;
