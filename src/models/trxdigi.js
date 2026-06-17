const mongoose = require('mongoose');

const DigiFlazzSkema = new mongoose.Schema({
    ref_id: { type: String, required: true },
    customer_no: { type: String, required: true },
    buyer_sku_code: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, required: true },
    rc: { type: String, required: true },
    buyer_last_saldo: { type: Number, required: true },
    sn: { type: String, required: false },
    price: { type: Number, required: true },
    tele: { type: String, required: true },
    wa: { type: String, required: true },
});

const DigiFlazz = mongoose.model('DigiFlazz', DigiFlazzSkema);

module.exports = DigiFlazz;