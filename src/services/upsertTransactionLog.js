const TransactionLog = require('../models/transactionLog');

const RELEVANT_PULSA_CATEGORIES_UPPER = ['PULSA', 'PAKET DATA'];
const RELEVANT_PLN_CATEGORIES_UPPER = ['PLN', 'TOKEN LISTRIK', 'TOKEN'];
const RELEVANT_GAME_CATEGORIES_UPPER = ['GAME', 'TOPUP', 'VOUCHER GAME', 'DIAMOND', 'UC'];
const RELEVANT_EMONEY_CATEGORIES_UPPER = ['E-MONEY', 'E-WALLET', 'SALDO DIGITAL', 'DANA', 'OVO', 'GOPAY', 'SHOPEEPAY', 'MAXIM'];
const PRODUCT_ICON_KEYS = [
    'Pulsa',
    'Token Listrik',
    'Game Topup',
    'FREE FIRE',
    'MOBILE LEGENDS',
    'GENSHIN IMPACT',
    'HONKAI STAR RAIL',
    'PLN',
    'E-Money',
    'Default',
];

function normalizeStatus(rawStatus) {
    const status = (rawStatus || '').toString().toLowerCase();
    if (status === 'sukses') return 'Sukses';
    if (status === 'pending') return 'Pending';
    if (status === 'gagal' || status === 'failed') return 'Gagal';
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
}

function toNumeric(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDetails(baseCustomer, detailParts = [], existingDetails = '') {
    if (detailParts.length > 0) {
        return `${baseCustomer} (${detailParts.join(' | ')})`;
    }

    if (existingDetails && existingDetails.startsWith(baseCustomer)) {
        const suffix = existingDetails.slice(baseCustomer.length).trim();
        if (suffix && !/transaksi/i.test(suffix)) {
            return existingDetails;
        }
    }

    return baseCustomer;
}

function determineTransactionCategoryDetails(productCategory = '', productBrand = '') {
    const categoryUpper = String(productCategory).toUpperCase();
    const brandUpper = String(productBrand).toUpperCase();

    if (RELEVANT_PULSA_CATEGORIES_UPPER.some((cat) => categoryUpper.includes(cat) || brandUpper.includes(cat))) {
        return { categoryKey: 'Pulsa', iconName: 'Pulsa' };
    }

    if (brandUpper.includes('PLN') || RELEVANT_PLN_CATEGORIES_UPPER.some((cat) => categoryUpper.includes(cat))) {
        return { categoryKey: 'Token Listrik', iconName: 'Token Listrik' };
    }

    if (brandUpper.includes('FREE FIRE')) return { categoryKey: 'FREE FIRE', iconName: 'FREE FIRE' };
    if (brandUpper.includes('MOBILE LEGENDS')) return { categoryKey: 'MOBILE LEGENDS', iconName: 'MOBILE LEGENDS' };
    if (brandUpper.includes('GENSHIN IMPACT')) return { categoryKey: 'GENSHIN IMPACT', iconName: 'GENSHIN IMPACT' };
    if (brandUpper.includes('HONKAI STAR RAIL')) return { categoryKey: 'HONKAI STAR RAIL', iconName: 'HONKAI STAR RAIL' };

    if (RELEVANT_GAME_CATEGORIES_UPPER.some((cat) => categoryUpper.includes(cat) || brandUpper.includes(cat))) {
        return { categoryKey: 'Game Topup', iconName: 'Game Topup' };
    }

    if (RELEVANT_EMONEY_CATEGORIES_UPPER.some((cat) => categoryUpper.includes(cat) || brandUpper.includes(cat))) {
        return { categoryKey: 'E-Money', iconName: 'E-Money' };
    }

    const fallbackKey = productCategory || 'Digital Service';
    const iconMatch = PRODUCT_ICON_KEYS.find((key) => String(fallbackKey).toUpperCase().includes(key.toUpperCase()));
    if (iconMatch) {
        return { categoryKey: iconMatch, iconName: iconMatch };
    }

    return { categoryKey: 'Default', iconName: 'Default' };
}

async function upsertTransactionLog({
    id,
    provider,
    user,
    source,
    status,
    message,
    serialNumber,
    productName,
    buyerSkuCode,
    originalCustomerNo,
    categoryName,
    brandName,
    providerTransactionId,
    costPrice,
    sellingPrice,
    detailParts = [],
    timestamp = new Date(),
}) {
    try {
        const existing = await TransactionLog.findOne({ id }).lean().exec();
        const normalizedStatus = normalizeStatus(status);
        const resolvedTimestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const baseCustomer = originalCustomerNo || existing?.originalCustomerNo || id;
        const resolvedProductName = productName || existing?.productName || 'Unknown Product';
        const resolvedCategoryName = categoryName || existing?.productCategoryFromProvider || 'Unknown Category';
        const resolvedBrandName = brandName || existing?.productBrandFromProvider || resolvedProductName;
        const resolvedBuyerSkuCode = buyerSkuCode || existing?.buyerSkuCode || resolvedProductName;
        const resolvedCostPrice = toNumeric(costPrice, existing?.costPrice ?? 0);
        const resolvedSellingPrice = existing?.sellingPrice ?? toNumeric(sellingPrice, resolvedCostPrice);
        const { categoryKey, iconName } = determineTransactionCategoryDetails(resolvedCategoryName, resolvedBrandName);

        const logData = {
            id,
            productName: resolvedProductName,
            details: buildDetails(baseCustomer, detailParts, existing?.details),
            costPrice: resolvedCostPrice,
            sellingPrice: resolvedSellingPrice,
            status: normalizedStatus,
            timestamp: resolvedTimestamp,
            buyerSkuCode: resolvedBuyerSkuCode,
            originalCustomerNo: baseCustomer,
            productCategoryFromProvider: resolvedCategoryName,
            productBrandFromProvider: resolvedBrandName,
            provider,
            transactedBy: user || existing?.transactedBy || 'telegram_user',
            source: source || existing?.source || 'telegram_bot',
            categoryKey,
            iconName,
            providerTransactionId: providerTransactionId || existing?.providerTransactionId || null,
            timestampDate: resolvedTimestamp,
            transactionYear: resolvedTimestamp.getFullYear(),
            transactionMonth: resolvedTimestamp.getMonth() + 1,
            transactionDayOfMonth: resolvedTimestamp.getDate(),
            transactionDayOfWeek: resolvedTimestamp.getDay(),
            transactionHour: resolvedTimestamp.getHours(),
            failureReason: normalizedStatus === 'Gagal' ? (message || null) : null,
            serialNumber: serialNumber ? serialNumber.toString() : existing?.serialNumber || null,
        };

        return TransactionLog.findOneAndUpdate(
            { id },
            { $set: logData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } catch (error) {
        console.warn('TransactionLog upsert warning:', error?.message || error);
        return null;
    }
}

module.exports = {
    determineTransactionCategoryDetails,
    upsertTransactionLog,
    normalizeStatus,
    toNumeric,
};
