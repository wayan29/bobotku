const mongoose = require('mongoose');
require('dotenv').config()

const userSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    username: { type: String },
    isPremium: { type: Boolean, default: false },
    role: {
        type: String,
        enum: ['owner', 'admin', 'user'],
        default: 'user',
    },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: null },
    deniedAt: { type: Date, default: null },
    deniedBy: { type: String, default: null },
}, {
    collection: 'white_id',
    timestamps: true,
});


const User = mongoose.model('User', userSchema);

module.exports = User;
