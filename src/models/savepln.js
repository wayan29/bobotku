const mongoose = require('mongoose');

const savePlnSchema = new mongoose.Schema({
    chatId: { type: Number, required: true },
    username: { type: String, default: null },
    identityKey: { type: String, required: true },
    customerNo: { type: String, required: true },
    subscriberId: { type: String, default: null },
    meterNo: { type: String, default: null },
    name: { type: String, required: true },
    nickname: { type: String, default: null },
    segmentPower: { type: String, default: null },
    provider: { type: String, default: 'digiflazz' },
    source: { type: String, required: true },
    lastRefId: { type: String, default: null },
    lastProductName: { type: String, default: null },
    lastVerifiedAt: { type: Date, required: true }
}, {
    timestamps: true,
    collection: 'savepln'
});

savePlnSchema.index({ chatId: 1, identityKey: 1 }, { unique: true });

const SavePln = mongoose.model('SavePln', savePlnSchema);

module.exports = SavePln;
