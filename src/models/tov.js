const mongoose = require('mongoose');

const TokoVoucher = new mongoose.Schema({
    status: { type: String, required: true },
    message: { type: String, required: true },
    sn: { type: String, required: false },
    ref_id: { type: String, required: true },
    trx_id: { type: String, required: true },
    produk: { type: String, required: true },
    sisa_saldo: { type: Number, required: true },
    price: { type: Number, required: true },
});

const TokoV = mongoose.model('TokoV', TokoVoucher);

module.exports = TokoV;