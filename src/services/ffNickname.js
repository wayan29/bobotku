const axios = require('axios');

async function inquireViaGoPay(userId) {
  const url = `https://gopay.co.id/games/v1/order/prepare/FREEFIRE?userId=${encodeURIComponent(userId)}&zoneId=`;
  try {
    const { data, status } = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    if (
      status === 200 &&
      typeof data?.message === 'string' &&
      data.message.toLowerCase() === 'success' &&
      typeof data?.data === 'string'
    ) {
      return {
        isSuccess: true,
        nickname: data.data,
        message: 'Nickname found via GoPay',
        rawResponse: data,
      };
    }

    return {
      isSuccess: false,
      message: data?.message || 'Invalid User ID or unknown error',
      rawResponse: data,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: `GoPay error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function inquireViaGoPayThenDuniaGames(userId) {
  const gopayResult = await inquireViaGoPay(userId);
  if (gopayResult.isSuccess) return gopayResult;
  return inquireViaDuniaGames(userId);
}

async function inquireViaDuniaGames(userId) {
  const url = 'https://api.duniagames.co.id/api/transaction/v1/top-up/inquiry/store';
  try {
    const { data, status } = await axios.post(url, {
      productId: 3,
      itemId: 353,
      catalogId: 376,
      paymentId: 1252,
      gameId: String(userId),
      product_ref: 'CMS',
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
        message: 'Nickname found via DuniaGames',
        rawResponse: data,
      };
    }

    return {
      isSuccess: false,
      message: data?.status?.message || 'Invalid User ID or unknown error',
      rawResponse: data,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: `DuniaGames error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function inquireFFNickname(userId) {
  if (!userId) {
    return {
      isSuccess: false,
      message: 'User ID kosong.',
    };
  }

  const codashopUrl = 'https://order-sg.codashop.com/initPayment.action';
  const datePart = new Date().toLocaleDateString('en-CA');
  const nonce = `${datePart.replace(/-/g, '/')}-${Math.floor(Math.random() * 1000)}`;

  const postData = {
    'voucherPricePoint.id': 8120,
    'voucherPricePoint.price': 50000.0,
    'voucherPricePoint.variablePrice': 0,
    n: nonce,
    email: '',
    userVariablePrice: 0,
    'order.data.profile': 'eyJuYW1lIjoiICIsImRhdGVvZmJpcnRoIjoiIiwiaWRfbm8iOiIifQ==',
    'user.userId': userId,
    'user.zoneId': '',
    msisdn: '',
    voucherTypeName: 'FREEFIRE',
    shopLang: 'id_ID',
    voucherTypeId: 17,
    gvtId: 33,
    checkoutId: '',
    affiliateTrackingId: '',
    impactClickId: '',
    anonymousId: '',
  };

  try {
    const { data, status } = await axios.post(codashopUrl, postData, {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.codashop.com',
        Referer: 'https://www.codashop.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    if (status !== 200) {
      return inquireViaGoPayThenDuniaGames(userId);
    }

    if (data?.RESULT_CODE === '10001' || data?.resultCode === '10001') {
      return {
        isSuccess: false,
        message: 'Too many attempts. Please wait and try again.',
        rawResponse: data,
      };
    }

    if (data?.success && !data?.errorMsg) {
      let extracted;

      if (typeof data?.result === 'string') {
        try {
          const decoded = decodeURIComponent(data.result);
          const parsed = JSON.parse(decoded);
          if (parsed?.roles?.[0]?.role) extracted = decodeURIComponent(parsed.roles[0].role);
          else if (parsed?.username) extracted = decodeURIComponent(parsed.username);
        } catch (_) {
          // swallow parsing errors
        }
      }

      if (!extracted && typeof data?.confirmationFields?.roles?.[0]?.role === 'string') {
        try {
          extracted = decodeURIComponent(data.confirmationFields.roles[0].role);
        } catch (_) {
          extracted = data.confirmationFields.roles[0].role;
        }
      }

      if (!extracted && typeof data?.confirmationFields?.username === 'string') {
        try {
          extracted = decodeURIComponent(data.confirmationFields.username);
        } catch (_) {
          extracted = data.confirmationFields.username;
        }
      }

      if (extracted) {
        return {
          isSuccess: true,
          nickname: extracted,
          message: 'Nickname found via Codashop',
          rawResponse: data,
        };
      }

      return inquireViaGoPayThenDuniaGames(userId);
    }

    if (data?.errorMsg) {
      return {
        isSuccess: false,
        message: data.errorMsg,
        rawResponse: data,
      };
    }

    return inquireViaGoPayThenDuniaGames(userId);
  } catch (error) {
    return inquireViaGoPayThenDuniaGames(userId);
  }
}

module.exports = { inquireFFNickname };
