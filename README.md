# 🤖 Bobotku — Telegram Bot Transaksi Digital

Bot Telegram untuk pembelian produk digital lintas provider (TokoVoucher & Digiflazz) dengan alur yang rapi dan ramah perangkat mobile. Mendukung konfirmasi pesanan sebelum transaksi diproses, serta pencatatan transaksi ke MongoDB.

## 🌟 Fitur Utama

- 🧩 Multi-Provider: TokoVoucher & Digiflazz
- 🧭 Alur tertata: Kategori → Brand → Produk → Detail → Konfirmasi → Proses
- ✅ Konfirmasi transaksi: user meninjau detail pesanan lalu memilih Setuju/Batal
- 🧾 Log transaksi ke MongoDB (riwayat, status, harga, SN, dsb.)
- 🔎 Utilitas: cek PLN (`/pln`), cek operator (`/op`), cek status transaksi
- 📱 Tampilan mobile-friendly: daftar dipecah per blok, penomoran 2 digit

## 🧱 Arsitektur Singkat

- Telegraf Scenes (FSM):
  - `selectCategory` → `selectBrand` → `selectProduct` → `productDetail` → `enterDestinationNumber` → `enterServerId`
  - Provider handler: `scenes/providers/digiflazz.js`, `scenes/providers/tokovoucher.js`
- Middleware:
  - `middleware/CheckTOV.js`, `middleware/Digiflazz.js`, `middleware/Checkop.js`, `middleware/rateLimitCommands.js`
- Model MongoDB:
  - `models/mongoose.js` (User access/role gate), `models/transactionLog.js`, legacy `models/trxdigi.js`, `models/tov.js`
- Layanan/Util:
  - `services/http.js` (Digiflazz), `services/http_toko.js` (TokoVoucher)
  - `services/keyboard.js` (keyboard/chunking), `services/plncuy.js`
  - `utils/sanitize.js` (safe input), `utils/rateLimiter.js` (cooldown)

## 📦 Struktur Proyek

```
/
├── src/
│   ├── constants/
│   │   └── sceneKeys.js
│   ├── handlers/                  # command & global middleware
│   │   ├── accessCommands.js
│   │   ├── globalMiddleware.js
│   │   ├── receiptCommand.js
│   │   ├── transactionsCommand.js
│   │   └── utilityCommands.js
│   ├── middleware/
│   │   ├── Checkop.js
│   │   ├── CheckTOV.js
│   │   ├── Digiflazz.js
│   │   └── rateLimitCommands.js
│   ├── models/
│   │   ├── mongoose.js
│   │   ├── tov.js
│   │   ├── trxdigi.js
│   │   ├── dgcache.js
│   │   ├── savepln.js
│   │   └── transactionLog.js
│   ├── scenes/
│   │   ├── botMenu.js
│   │   ├── enterDestinationNumber.js
│   │   ├── enterServerId.js
│   │   ├── productDetail.js
│   │   ├── providers/
│   │   │   ├── digiflazz.js
│   │   │   └── tokovoucher.js
│   │   ├── selectBrand.js
│   │   ├── selectCategory.js
│   │   └── selectProduct.js
│   ├── services/
│   │   ├── accessControl.js
│   │   ├── http.js
│   │   ├── http_toko.js
│   │   ├── keyboard.js
│   │   ├── ffNickname.js
│   │   ├── mlNickname.js
│   │   ├── plncuy.js
│   │   ├── receipt.js
│   │   ├── savePln.js
│   │   └── upsertTransactionLog.js
│   ├── utils/
│   │   ├── formatters.js
│   │   ├── rateLimiter.js
│   │   ├── refid.js
│   │   ├── sanitize.js
│   │   └── sessionState.js
│   └── index.js
├── .env.example
├── package.json
└── README.md
```

## ⚙️ Konfigurasi

> **Persyaratan:** Node.js ≥ 18 (direkomendasikan 20 LTS / 22 LTS).

Buat `.env` di root (variabel yang relevan):

```env
# Telegram Bot
TOKEN=your_telegram_bot_token
OWNER_CHAT_ID=             # opsional; jika kosong, user pertama menjadi owner

# MongoDB
MONGO_URL=mongodb://username:password@host:27017/dbname

# Digiflazz
username=your_digiflazz_username
apikey=your_digiflazz_apikey

# TokoVoucher
member_code=your_member_code
secret=your_secret_key
signature=your_signature   # opsional bila layanan Anda membutuhkannya
TOV_USE_GET=0              # 1 = fallback ke GET lama (secret di query); 0 = POST (default, lebih aman)
TOV_TIMEOUT_MS=15000       # timeout request TokoVoucher (ms)

# Catatan keamanan transaksi
# Flow Telegram saat ini confirmation-only; PIN transaksi belum digunakan di bot Telegram.

# Production webhook (opsional)
HEROKU_URL=https://yourapp.example.com
PORT=3000
NODE_ENV=production
```

Catatan akses pengguna:
- Bot memakai akses berbasis role di koleksi `white_id`.
- Jika `OWNER_CHAT_ID` diisi di `.env`, chat ID tersebut otomatis menjadi owner.
- Jika `OWNER_CHAT_ID` kosong dan belum ada owner di database, user pertama yang mengirim pesan ke bot otomatis menjadi owner.
- User berikutnya tersimpan sebagai pending dan harus diizinkan owner/admin lewat bot.
- Perintah akses:
  - `/me` — lihat Chat ID, role, dan status akses Anda.
  - `/users` — owner/admin melihat daftar user.
  - `/approve <chatId>` — owner/admin mengizinkan user.
  - `/deny <chatId>` — owner/admin mencabut akses user.
  - `/promote <chatId>` — owner-only, jadikan user sebagai admin.
  - `/demote <chatId>` — owner-only, turunkan admin menjadi user biasa.
  - `/deleteuser <chatId>` — owner/admin menghapus data user dari whitelist.

## 🚀 Menjalankan

- Development (polling):
  ```bash
  npm install
  npm run dev
  ```
- Production:
  ```bash
  npm install --production
  npm start
  ```

## 🧭 Alur Penggunaan (UX)

1) Pilih Provider (TokoVoucher / Digiflazz)
2) Pilih Kategori → Brand → Produk
3) Tinjau Detail → Masukkan nomor tujuan (dan Server ID bila perlu)
4) Konfirmasi pesanan (Setuju/Batal)
5) Jika setuju, transaksi diproses → hasil ditampilkan → log tersimpan

> ℹ️ Catatan: Integrasi /ai (rekomendasi otomatis) sudah dinonaktifkan. Semua alur kembali sepenuhnya manual melalui menu provider.

## 🔐 Security Hardening (v2026)

- **Dependency audit clean** — 0 vulnerabilities (axios ≥1.15.3, mongoose ≥7.8.9, form-data ≥4.0.6, follow-redirects ≥1.16.0).
- **Credential isolation** — `secret`/`apiKey` tidak diekspor dari `services/http*` module (hanya fungsi publik).
- **TokoVoucher POST** — transaksi memakai `POST /v1/transaksi` + signature hash (bukan `secret` di query string). Legacy GET fallback via `TOV_USE_GET=1`.
- **Input sanitasi** — `utils/sanitize.js` (`safeText`, `safeDestination`) dipakai semua scene.
- **Rate limiting** — cooldown per chat ID untuk `/tov`, `/dg`, `/struk`, `/reloaddg`.
- **Log masking** — `secret`/`signature` di-redact dari URL & error log.
- **Session order** — `session()` didaftarkan sebelum middleware yang membaca `ctx.session`.
- **Graceful shutdown** — SIGINT/SIGTERM menutup bot + mongoose dengan rapi.

## 🧰 Perintah Bot

- `/start` — mulai interaksi
- `/me` — lihat Chat ID, role, dan status akses
- `/users` — owner/admin melihat daftar user
- `/approve <chatId>` — owner/admin mengizinkan user
- `/deny <chatId>` — owner/admin mencabut akses user
- `/promote <chatId>` — owner-only, jadikan user sebagai admin
- `/demote <chatId>` — owner-only, turunkan admin menjadi user biasa
- `/deleteuser <chatId>` — owner/admin menghapus data user dari whitelist
- `/pln <no_pelanggan>` — validasi/cek PLN
- `/op <nomor_hp>` — deteksi operator seluler
- `/ff <user_id>` — cek nickname Free Fire
- `/ml <user_id> <server_id>` — cek nickname Mobile Legends
- `/tov <ref_id>` — cek status transaksi TokoVoucher (alias lama: `/tovcheck`)
- `/tov` — daftar transaksi TokoVoucher
- `/dg <ref_id>` — cek status transaksi Digiflazz (alias: `/digicheck`)
- `/dg` — daftar transaksi Digiflazz (alias: `/digi`)
- `/struk <ref_id>` — lihat/unduh struk transaksi
- `/transactions` — log transaksi terakhir (gabungan)

## 🐞 Troubleshooting

- Tidak bisa akses bot: kirim `/me`, salin Chat ID, lalu minta owner/admin menjalankan `/approve <chatId>`.
- Data Digiflazz kosong: sistem akan force refresh saat membuka kategori Digiflazz; cek kredensial `.env` bila tetap kosong.
- Bot balas "Terlalu cepat. Coba lagi dalam X detik" — Anda terkena rate limit. Tunggu sesuai petunjuk lalu ulangi.
- Transaksi TokoVoucher gagal karena signature: pastikan `member_code` & `secret` benar. Jika provider lama bermasalah dengan POST, set `TOV_USE_GET=1` sebagai fallback sementara.

## 🔔 Provider Webhooks

Bot dapat menerima callback status transaksi dari provider agar status `transactions_log` otomatis diperbarui tanpa polling manual.

### URL Webhook

Daftarkan URL berikut di dashboard provider:

```text
Digiflazz   : https://your-domain.example.com/webhooks/digiflazz
TokoVoucher : https://your-domain.example.com/webhooks/tokovoucher
```

Path bisa diubah lewat `.env`:

```env
DIGIFLAZZ_WEBHOOK_PATH=/webhooks/digiflazz
TOKOVOUCHER_WEBHOOK_PATH=/webhooks/tokovoucher
WEBHOOK_MAX_BODY_BYTES=65536
```

### Security

- **Digiflazz**: jika `DIGIFLAZZ_WEBHOOK_SECRET` diisi, bot memverifikasi header signature HMAC (`X-Hub-Signature` / `X-Digiflazz-Signature`) terhadap raw body.
- **TokoVoucher**: bot memverifikasi `X-TokoVoucher-Authorization = md5(MEMBER_CODE:SECRET:REF_ID)` bila `REQUIRE_TOKOVOUCHER_WEBHOOK_AUTH=1`.
- Webhook memakai `upsertTransactionLog()` sehingga idempotent dan tidak membuat duplicate log.
- Event `ping` Digiflazz dijawab `200` tanpa menulis transaksi.
- Setelah webhook sukses diproses, bot mengirim detail status ke chat ID user pemilik transaksi (berdasarkan `TransactionLog.transactedBy` → koleksi `white_id`).
- Owner/admin (`WEBHOOK_NOTIFY_CHAT_ID` atau fallback `OWNER_CHAT_ID`) mendapat ringkasan berisi siapa user yang transaksi, provider, status, Ref ID, dan SN.
- Notifikasi webhook menyertakan tombol mobile-friendly `Cetak Struk` dan `Salin SN` (Telegram `copy_text`) bila data tersedia.
- Default: notifikasi retry/duplikat webhook diabaikan bila status+SN sama. Set `WEBHOOK_NOTIFY_DUPLICATES=1` untuk selalu kirim.

Contoh env:

```env
HEROKU_URL=https://your-domain.example.com
PORT=3000
DIGIFLAZZ_WEBHOOK_SECRET=your_webhook_secret
REQUIRE_TOKOVOUCHER_WEBHOOK_AUTH=1
WEBHOOK_NOTIFY_ENABLED=1
WEBHOOK_NOTIFY_CHAT_ID=your_admin_chat_id
WEBHOOK_NOTIFY_DUPLICATES=0
```

## 🧾 Kontrak Schema Transaksi

Koleksi MongoDB utama untuk log transaksi adalah `transactions_log`. Karena koleksi ini dipakai bersama oleh web project dan bot Telegram, gunakan dokumen berikut sebagai acuan field dan aturan update aman:

```text
TRANSACTIONS_LOG_SCHEMA.md
```

Ringkasnya: web/bot membuat identitas transaksi awal, sedangkan webhook hanya mengupdate status/SN tanpa menimpa `transactedBy`, `source`, `sellingPrice`, `productName`, dan `originalCustomerNo`.

## ✅ Verifikasi & Maintenance

- Cek dependency security:
  ```bash
  npm audit
  ```
- Cek syntax cepat file utama:
  ```bash
  node --check src/index.js
  node --check src/services/http.js
  node --check src/services/http_toko.js
  ```
- Audit data transaksi (jika script maintenance tersedia di environment deployment):
  ```bash
  npm run audit:trx
  npm run audit:trx:json
  npm run audit:trx:file
  npm run audit:trx:strict
  ```
- Folder/file runtime seperti `data/`, `cache/`, `audit-reports/`, `.env`, dan `.waha/` tidak di-commit ke Git.

## 🤝 Kontribusi

1) Fork repo ini
2) Buat branch fitur (`feat/...`)
3) Commit singkat dan jelas
4) PR dengan deskripsi perubahan

---

Selamat bertransaksi dengan aman dan nyaman! 🎉
