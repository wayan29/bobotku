const mongoose = require('mongoose');

const DgCacheSchema = new mongoose.Schema({
    product_name: { type: String, required: true },
    category: { type: String, required: true, index: true },
    brand: { type: String, required: true, index: true },
    type: { type: String, required: true },
    seller_name: { type: String, required: true },
    price: { type: Number, required: true },
    buyer_sku_code: { type: String, required: true, unique: true, index: true },
    buyer_product_status: { type: Boolean, required: true },
    seller_product_status: { type: Boolean, required: true },
    unlimited_stock: { type: Boolean, default: true },
    stock: { type: Number, default: 0 },
    multi: { type: Boolean, default: false },
    start_cut_off: { type: String, default: '' },
    end_cut_off: { type: String, default: '' },
    desc: { type: String, default: '' },
    last_updated: { type: Date, default: Date.now }
});

// Index untuk pencarian yang sering dilakukan
DgCacheSchema.index({ category: 1, brand: 1 });
DgCacheSchema.index({ product_name: 1 });

const DgCache = mongoose.model('dgcache', DgCacheSchema, 'dgcache');

module.exports = DgCache;
