const axios = require('axios');

async function inquireViaGoPayML(userId, zoneId) {
  try {
    const { data, status } = await axios.post(
      'https://gopay.co.id/games/v1/order/user-account',
      {
        code: 'MOBILE_LEGENDS',
        data: { userId, zoneId }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
        },
        timeout: 10000,
      }
    );

    if ((status === 200 || status === 201) && typeof data?.message === 'string' && data.message.toLowerCase() === 'success') {
      let nickname;
      const accountData = data?.data;

      if (typeof accountData === 'string') {
        nickname = accountData;
      } else if (accountData && typeof accountData === 'object') {
        nickname =
          accountData.username ||
          accountData.userName ||
          accountData.name ||
          accountData.displayName ||
          accountData.nickname ||
          accountData.customerName ||
          accountData.accountName ||
          accountData.profileName;
      }

      const country =
        (accountData && typeof accountData === 'object' && (
          accountData.countryOrigin ||
          accountData.country ||
          accountData.area ||
          accountData.region
        )) || undefined;

      if (typeof nickname === 'string' && nickname.trim().length > 0) {
        return {
          isSuccess: true,
          nickname: nickname.trim(),
          country: typeof country === 'string' && country.trim() ? country.trim() : undefined,
          message: 'Nickname ditemukan melalui GoPay',
          rawResponse: data,
        };
      }

      return {
        isSuccess: false,
        message: 'Nickname tidak ditemukan dari respons GoPay.',
        rawResponse: data,
      };
    }

    return {
      isSuccess: false,
      message: data?.message || 'Nickname tidak ditemukan',
      rawResponse: data,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: `GoPay error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function inquireViaDuniaGamesML(userId, zoneId) {
  const url = 'https://api.duniagames.co.id/api/transaction/v1/top-up/inquiry/store';
  try {
    const { data, status } = await axios.post(url, {
      productId: 1,
      itemId: 1112,
      catalogId: 2293,
      paymentId: 5653,
      gameId: String(userId),
      zoneId: String(zoneId),
      product_ref: 'REG',
      product_ref_denom: 'REG',
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    const nickname = data?.data?.userNameGame || data?.data?.gameDetail?.userName;
    if (status === 200 && typeof nickname === 'string' && nickname.trim().length > 0) {
      return {
        isSuccess: true,
        nickname: nickname.trim(),
        message: 'Nickname ditemukan melalui DuniaGames',
        rawResponse: data,
      };
    }

    return {
      isSuccess: false,
      message: data?.status?.message || 'Nickname tidak ditemukan',
      rawResponse: data,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: `DuniaGames error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function inquireViaGoPayThenDuniaGamesML(userId, zoneId) {
  const gopayResult = await inquireViaGoPayML(userId, zoneId);
  if (gopayResult.isSuccess) return gopayResult;
  return inquireViaDuniaGamesML(userId, zoneId);
}

async function inquireMobileLegendsNickname(userId, zoneId) {
  if (!userId || !zoneId) {
    return {
      isSuccess: false,
      message: 'User ID atau Zone ID kosong.',
    };
  }

  const codashopUrl = 'https://order-sg.codashop.com/initPayment.action';
  const datePart = new Date().toLocaleDateString('en-CA');
  const nonce = `${datePart.replace(/-/g, '/')}-${Math.floor(Math.random() * 1000)}`;

  const postData = {
    'voucherPricePoint.id': 1471,
    'voucherPricePoint.price': 84360.0,
    'voucherPricePoint.variablePrice': 0,
    n: nonce,
    email: '',
    userVariablePrice: 0,
    'order.data.profile': 'eyJuYW1lIjoiICIsImRhdGVvZmJpcnRoIjoiIiwiaWRfbm8iOiIifQ==',
    'user.userId': userId,
    'user.zoneId': zoneId,
    msisdn: '',
    voucherTypeName: 'MOBILE_LEGENDS',
    voucherTypeId: 5,
    gvtId: 19,
    checkoutId: '',
    affiliateTrackingId: '',
    impactClickId: '',
    anonymousId: ''
  };

  try {
    const { data, status } = await axios.post(codashopUrl, postData, {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.codashop.com',
        Referer: 'https://www.codashop.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
      },
      timeout: 10000,
    });

    if (status !== 200) {
      return inquireViaGoPayThenDuniaGamesML(userId, zoneId);
    }

    if (data?.RESULT_CODE === '10001' || data?.resultCode === '10001') {
      return {
        isSuccess: false,
        message: 'Terlalu banyak percobaan. Coba lagi nanti.',
        rawResponse: data,
      };
    }

    if (data?.success && !data?.errorMsg) {
      const extractedNickname = extractCodashopNickname(data);

      if (extractedNickname) {
        return {
          isSuccess: true,
          nickname: extractedNickname,
          message: 'Nickname ditemukan melalui Codashop',
          rawResponse: data,
        };
      }

      return inquireViaGoPayThenDuniaGamesML(userId, zoneId);
    }

    if (data?.errorMsg) {
      return {
        isSuccess: false,
        message: data.errorMsg,
        rawResponse: data,
      };
    }

    return inquireViaGoPayThenDuniaGamesML(userId, zoneId);
  } catch (error) {
    console.error('Error during Mobile Legends nickname inquiry:', error?.message || error);
    return inquireViaGoPayThenDuniaGamesML(userId, zoneId);
  }
}

module.exports = { inquireMobileLegendsNickname };

function extractCodashopNickname(data) {
  const candidates = new Set();

  const pushCandidate = (value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      candidates.add(decodeURIComponent(trimmed));
    } catch {
      candidates.add(trimmed);
    }
  };

  if (typeof data?.confirmationFields?.username === 'string') {
    pushCandidate(data.confirmationFields.username);
  }

  const roles = data?.confirmationFields?.roles;
  if (Array.isArray(roles)) {
    roles.forEach((role) => {
      pushCandidate(role?.role);
      pushCandidate(role?.value);
      pushCandidate(role?.label);
    });
  }

  if (typeof data?.result === 'string') {
    try {
      const decoded = decodeURIComponent(data.result);
      const parsed = JSON.parse(decoded);
      pushCandidate(parsed?.username);
      if (Array.isArray(parsed?.roles)) {
        parsed.roles.forEach((role) => {
          pushCandidate(role?.role);
          pushCandidate(role?.value);
        });
      }
    } catch (error) {
      console.warn('Failed to parse username from Codashop result:', error?.message || error);
    }
  }

  const directFields = ['username', 'userName', 'name', 'nickname', 'customerName'];
  directFields.forEach((field) => pushCandidate(data?.confirmationFields?.[field]));

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  return undefined;
}
