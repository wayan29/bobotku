# Kontrak Schema `transactions_log`

Dokumen ini menjadi acuan bersama untuk proyek web dan bot Telegram Bobotku saat membaca/menulis koleksi MongoDB `transactions_log`.

Tujuan utama:

- Web project tetap menjadi acuan struktur utama.
- Bot Telegram mengikuti struktur yang sama.
- Webhook provider hanya bertindak sebagai updater status, bukan pembuat identitas transaksi baru jika record sudah ada.
- Update dari banyak sumber tetap idempotent dan tidak saling menimpa field penting.

---

## Collection

```text
transactions_log
```

## Unique Key

```js
id // ref_id transaksi
```

Contoh:

```text
DF20260619130653003
TV20260619123456001
```

Aturan:

- `id` wajib unik.
- Semua update harus mencari berdasarkan `{ id }`.
- Jangan membuat record baru dengan `id` yang sama.

---

## Provider

Field:

```js
provider
```

Nilai yang valid:

```text
digiflazz
tokovoucher
```

---

## Field Identitas Transaksi

Field berikut dibuat saat transaksi awal dari web/bot dan **tidak boleh ditimpa oleh webhook** jika record sudah ada:

| Field | Fungsi |
|---|---|
| `id` | Ref ID transaksi |
| `provider` | Provider transaksi |
| `transactedBy` | User/pelaku transaksi (`username`, `chatId`, atau user web) |
| `source` | Sumber transaksi awal (`telegram_bot`, `web_panel`, dll.) |
| `productName` | Nama produk yang dibeli |
| `buyerSkuCode` | SKU/kode produk provider |
| `originalCustomerNo` | Nomor tujuan / ID player / ID pelanggan |
| `details` | Detail tambahan untuk tampilan web |
| `sellingPrice` | Harga jual ke user |
| `productCategoryFromProvider` | Kategori dari provider/web |
| `productBrandFromProvider` | Brand/operator dari provider/web |
| `categoryKey` | Kategori normalisasi untuk UI |
| `iconName` | Icon normalisasi untuk UI |

### Contoh

```json
{
  "id": "DF20260619130653003",
  "provider": "digiflazz",
  "transactedBy": "nengah1604",
  "source": "telegram_bot",
  "productName": "Token PLN 50.000",
  "buyerSkuCode": "ppln50",
  "originalCustomerNo": "32164884945",
  "details": "32164884945 (PLN: I NYOMAN SANTOSA)",
  "sellingPrice": 51420,
  "productCategoryFromProvider": "PLN",
  "productBrandFromProvider": "PLN",
  "categoryKey": "Token Listrik",
  "iconName": "Token Listrik"
}
```

---

## Field Status / Provider Update

Field berikut boleh diupdate oleh webhook/status refresh:

| Field | Fungsi |
|---|---|
| `status` | Status transaksi (`Pending`, `Sukses`, `Gagal`) |
| `serialNumber` | SN/token/voucher/provider serial |
| `providerTransactionId` | ID transaksi provider jika tersedia |
| `costPrice` | Harga/modal provider |
| `failureReason` | Pesan gagal jika status `Gagal` |
| `timestamp` | Waktu update status terakhir |
| `timestampDate` | Date object untuk query/report |
| `transactionYear` | Komponen waktu untuk report |
| `transactionMonth` | Komponen waktu untuk report |
| `transactionDayOfMonth` | Komponen waktu untuk report |
| `transactionDayOfWeek` | Komponen waktu untuk report |
| `transactionHour` | Komponen waktu untuk report |

---

## Status Normalisasi

Gunakan nilai final berikut:

```text
Pending
Sukses
Gagal
```

Mapping umum:

| Input Provider | Normalisasi |
|---|---|
| `sukses`, `success`, `berhasil`, `1`, `rc=00` | `Sukses` |
| `gagal`, `failed`, `failure`, `0` | `Gagal` |
| `pending`, `process`, `processing` | `Pending` |

---

## Aturan Update Aman

### 1. Selalu update by `id`

```js
findOneAndUpdate(
  { id: refId },
  { $set: updateFields },
  { upsert: true, new: true }
)
```

### 2. Jangan replace full document

Hindari:

```js
findOneAndReplace({ id }, fullPayloadFromWebhook)
```

Karena payload webhook biasanya tidak lengkap dan bisa menghapus/menimpa data penting.

### 3. Webhook tidak boleh mengubah owner transaksi

Webhook tidak boleh menimpa:

```js
transactedBy
source
sellingPrice
productName
originalCustomerNo
```

Jika record sudah ada, preserve nilai existing.

### 4. Jangan downgrade status terminal

Idealnya status terminal tidak turun:

```text
Sukses/Gagal -> Pending   // sebaiknya ditolak
```

Jika provider mengirim retry `Pending` setelah `Sukses`, jangan jadikan status kembali pending.

### 5. Webhook boleh membuat orphan record, tapi ditandai jelas

Jika webhook datang tapi record belum ada, boleh upsert dengan:

```js
transactedBy: "provider_webhook"
source: "digiflazz_webhook" | "tokovoucher_webhook"
```

Namun record seperti ini tidak bisa dikaitkan ke user Telegram/web kecuali diperbaiki manual.

---

## Source yang Disarankan

| Source | Makna |
|---|---|
| `telegram_bot` | Transaksi dibuat dari bot Telegram |
| `web_panel` | Transaksi dibuat dari web/admin panel |
| `digiflazz_webhook` | Record dibuat/diupdate dari webhook Digiflazz |
| `tokovoucher_webhook` | Record dibuat/diupdate dari webhook TokoVoucher |
| `manual_repair` | Perbaikan data manual/admin |

Catatan:

- Jika record awal dari `telegram_bot` atau `web_panel`, webhook sebaiknya mempertahankan `source` tersebut.
- Source webhook dipakai terutama untuk record orphan atau audit internal.

---

## Bot Telegram: Konvensi Saat Ini

Bot Bobotku menggunakan helper:

```text
src/services/upsertTransactionLog.js
```

Webhook provider menggunakan:

```text
src/services/providerWebhooks.js
```

Perilaku webhook bot:

- Cari existing record berdasarkan `id`.
- Jika existing ada, pertahankan owner/source/produk/tujuan/harga jual.
- Update status/SN/message/providerTransactionId.
- Kirim notifikasi ke user transaksi + ringkasan ke owner.

---

## Checklist Saat Mengubah Web atau Bot

Sebelum deploy perubahan yang menyentuh `transactions_log`:

- [ ] Pastikan `id` tetap unique key.
- [ ] Pastikan update memakai `$set`, bukan replace document.
- [ ] Pastikan webhook tidak menimpa `transactedBy`.
- [ ] Pastikan webhook tidak menimpa `source` transaksi awal.
- [ ] Pastikan `sellingPrice` tidak turun/hilang.
- [ ] Pastikan status ternormalisasi ke `Pending/Sukses/Gagal`.
- [ ] Test dengan ref_id Digiflazz dan TokoVoucher.
- [ ] Cek tampilan web dan notifikasi Telegram.

---

## Contoh Update Webhook Aman

```js
const existing = await TransactionLog.findOne({ id: refId }).lean();

const update = {
  status: normalizedStatus,
  serialNumber: sn || existing?.serialNumber || null,
  providerTransactionId: trxId || existing?.providerTransactionId || null,
  failureReason: normalizedStatus === 'Gagal' ? message : null,
  timestamp: new Date(),
  timestampDate: new Date(),
};

await TransactionLog.findOneAndUpdate(
  { id: refId },
  { $set: update },
  { upsert: false, new: true }
);
```

Jika ingin `upsert: true`, pastikan insert record baru tetap mengisi required fields sesuai model.
