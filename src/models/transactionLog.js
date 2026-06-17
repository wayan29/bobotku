const mongoose = require('mongoose');

const transactionLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  productName: { type: String, required: true },
  details: { type: String, required: true },
  costPrice: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  status: { type: String, required: true },
  timestamp: { type: Date, required: true },
  timestampDate: { type: Date, default: null },
  buyerSkuCode: { type: String, required: true },
  originalCustomerNo: { type: String, required: true },
  productCategoryFromProvider: { type: String, required: true },
  productBrandFromProvider: { type: String, required: true },
  provider: { type: String, required: true },
  transactedBy: { type: String, required: true },
  source: { type: String, required: true },
  categoryKey: { type: String, required: true },
  iconName: { type: String, required: true },
  providerTransactionId: { type: String, default: null },
  transactionYear: { type: Number, required: true },
  transactionMonth: { type: Number, required: true },
  transactionDayOfMonth: { type: Number, required: true },
  transactionDayOfWeek: { type: Number, required: true },
  transactionHour: { type: Number, required: true },
  failureReason: { type: String, default: null },
  serialNumber: { type: String, default: null }
}, {
  timestamps: true,
  collection: 'transactions_log'
});

const TransactionLog = mongoose.model('TransactionLog', transactionLogSchema);

module.exports = TransactionLog;
