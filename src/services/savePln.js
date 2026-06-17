const SavePln = require('../models/savepln');

const normalizeValue = (value) => {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
};

const normalizeChatId = (chatId) => {
    const normalizedChatId = Number(chatId);
    if (!Number.isFinite(normalizedChatId)) {
        throw new Error('chatId tidak valid untuk penyimpanan PLN');
    }

    return normalizedChatId;
};

const mapSavedPlnToVerification = (record) => {
    if (!record) return null;

    return {
        status: 'Sukses',
        name: normalizeValue(record.name),
        meter_no: normalizeValue(record.meterNo) || normalizeValue(record.customerNo),
        subscriber_id: normalizeValue(record.subscriberId) || normalizeValue(record.customerNo),
        segment_power: normalizeValue(record.segmentPower),
    };
};

async function saveVerifiedPln({
    chatId,
    username,
    customerNo,
    verification,
    source,
    refId = null,
    productName = null,
}) {
    const normalizedChatId = normalizeChatId(chatId);

    const normalizedCustomerNo = normalizeValue(customerNo);
    const subscriberId = normalizeValue(verification?.subscriber_id);
    const meterNo = normalizeValue(verification?.meter_no);
    const name = normalizeValue(verification?.name);
    const segmentPower = normalizeValue(verification?.segment_power);
    const identityKey = subscriberId || meterNo || normalizedCustomerNo;

    if (!normalizedCustomerNo || !name || !identityKey) {
        throw new Error('Data verifikasi PLN tidak lengkap');
    }

    return SavePln.findOneAndUpdate(
        { chatId: normalizedChatId, identityKey },
        {
            $set: {
                username: normalizeValue(username),
                customerNo: normalizedCustomerNo,
                subscriberId,
                meterNo,
                name,
                nickname: name,
                segmentPower,
                provider: 'digiflazz',
                source: normalizeValue(source) || 'unknown',
                lastRefId: normalizeValue(refId),
                lastProductName: normalizeValue(productName),
                lastVerifiedAt: new Date(),
            }
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }
    );
}

async function findSavedPlnByCustomerNo({
    chatId = null,
    customerNo,
    scope = 'global',
}) {
    const normalizedCustomerNo = normalizeValue(customerNo);

    if (!normalizedCustomerNo) {
        return null;
    }

    const query = {
        provider: 'digiflazz',
        $or: [
            { identityKey: normalizedCustomerNo },
            { customerNo: normalizedCustomerNo },
            { meterNo: normalizedCustomerNo },
            { subscriberId: normalizedCustomerNo },
        ],
    };

    if (scope === 'chat') {
        query.chatId = normalizeChatId(chatId);
    }

    return SavePln.findOne(query)
        .sort({ lastVerifiedAt: -1, updatedAt: -1 })
        .lean();
}

async function getSavedPlnList({
    chatId = null,
    limit = null,
    scope = 'global',
}) {
    const query = {
        provider: 'digiflazz',
    };

    if (scope === 'chat') {
        query.chatId = normalizeChatId(chatId);
    }

    const records = await SavePln.find(query)
        .sort({ lastVerifiedAt: -1, updatedAt: -1 })
        .lean();

    const uniqueRecords = [];
    const seen = new Set();

    for (const record of records) {
        const identityKey = normalizeValue(record.identityKey)
            || normalizeValue(record.subscriberId)
            || normalizeValue(record.meterNo)
            || normalizeValue(record.customerNo);

        if (!identityKey || seen.has(identityKey)) {
            continue;
        }

        seen.add(identityKey);
        uniqueRecords.push(record);

        if (limit !== null && limit !== undefined) {
            const normalizedLimit = Number(limit);
            if (Number.isFinite(normalizedLimit) && normalizedLimit > 0 && uniqueRecords.length >= Math.floor(normalizedLimit)) {
                break;
            }
        }
    }

    return uniqueRecords;
}

module.exports = {
    saveVerifiedPln,
    findSavedPlnByCustomerNo,
    getSavedPlnList,
    mapSavedPlnToVerification,
};
