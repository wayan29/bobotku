const TransactionLog = require('../models/transactionLog');

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDateTimeYYYYMMDDHHMMSS(d) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const MM = pad2(d.getMinutes());
  const SS = pad2(d.getSeconds());
  return `${yyyy}${mm}${dd}${HH}${MM}${SS}`;
}

async function countTodayTransactions() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const count = await TransactionLog.countDocuments({ timestamp: { $gte: start, $lt: end } });
  return count;
}

async function generateRefId(prefix = 'DF') {
  const now = new Date();
  const dateTime = formatDateTimeYYYYMMDDHHMMSS(now);
  const todayCount = await countTodayTransactions();
  const nextSeq = todayCount + 1;
  const seq = String(nextSeq).padStart(3, '0');
  return `${prefix}${dateTime}${seq}`;
}

module.exports = { generateRefId };

