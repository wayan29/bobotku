const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config({ override: true });

const TOV_BASE_URL = 'https://api.tokovoucher.net';
const TOV_TIMEOUT_MS = Number(process.env.TOV_TIMEOUT_MS || 15000);

const tovClient = axios.create({
  baseURL: TOV_BASE_URL,
  timeout: TOV_TIMEOUT_MS,
  maxRedirects: 0,
  headers: {
    Accept: 'application/json',
    'User-Agent': 'Bobotku-TokoVoucher/1.0',
  },
});

const SENSITIVE_QUERY_KEYS = new Set(['secret', 'signature']);

function maskSecret(value) {
  if (!value) return value;
  const text = String(value);
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function redactUrl(url) {
  try {
    const parsed = new URL(url, TOV_BASE_URL);
    SENSITIVE_QUERY_KEYS.forEach((key) => {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '***');
    });
    return parsed.toString();
  } catch {
    return String(url).replace(/([?&](?:secret|signature)=)[^&]+/gi, '$1***');
  }
}

function toSafeAxiosError(error) {
  const safe = {
    message: error?.message,
    status: error?.response?.status,
    data: error?.response?.data,
  };
  if (error?.config?.url) safe.url = redactUrl(error.config.url);
  return safe;
}

async function tovGet(path, params = {}) {
  return tovClient.get(path, { params });
}

async function tovPost(path, data = {}) {
  return tovClient.post(path, data, { headers: { 'Content-Type': 'application/json' } });
}

function generateSignature(memberCode, secret, refId) {
  if (!memberCode || !secret || !refId) {
    throw new Error('Missing parameters for signature generation');
  }
  const stringToHash = `${memberCode}:${secret}:${refId}`;
  return crypto.createHash('md5').update(stringToHash).digest('hex');
}

const { generateRefId } = require('../utils/refid');

const tokoVoucher = {
  memberCode: process.env.member_code,
  signature: process.env.signature,
  secret : process.env.secret,
};
  /**
   * Helper function to generate TokoVoucher member endpoint params.
   * TokoVoucher docs use GET query parameters for member endpoints.
   * Keep params separate from logging so secret/signature are not printed.
   */
  const generateMemberParams = (memberCode, signature, params = {}) => ({
        member_code: memberCode,
        signature,
        ...params
    });

   /**
     * Fetches the list of product categories from TokoVoucher API.
     * @returns {Promise<any[]>}
     */
    async function getKategori() {
          const { memberCode, signature } = tokoVoucher;
          const params = generateMemberParams(memberCode, signature);
         try {
           const response = await tovGet('/member/produk/category/list', params);
           return response.data.data;
         } catch (error) {
            console.error('Error fetching categories:', toSafeAxiosError(error));
            throw error;
         }
    }
     /**
     * Finds a category ID by its name from TokoVoucher API.
     * @param {string} name
     * @returns {Promise<string|undefined>}
     */
     async function findIdByName(name) {
      try {
           const categories = await getKategori();
            const category = categories.find(category => category.nama === name);
             return category ? category.id : undefined;
        } catch (error) {
            console.error(`Error finding category ID by name ${name}:`, error?.message || error);
              throw error;
        }
    }
    /**
     * Fetches the list of operators for a given category from TokoVoucher API.
     * @param {string} categoryId
     * @returns {Promise<any[]>}
     */
    async function getOperatorByCategory(categoryId) {
        const { memberCode, signature } = tokoVoucher;
       const params = generateMemberParams(memberCode, signature, { id: categoryId });
        try {
             const response = await tovGet('/member/produk/operator/list', params);
            return response.data.data;
          } catch (error) {
            console.error(`Error fetching operators for category ID ${categoryId}:`, toSafeAxiosError(error));
            throw error;
         }
    }
    /**
     * Finds an operator ID by its name and category ID from TokoVoucher API.
     * @param {string} name
     * @param {string} categoryId
     * @returns {Promise<string|undefined>}
     */
    async function findIdOperatorByName(name, categoryId) {
       try {
            const operators = await getOperatorByCategory(categoryId);
            const operator = operators.find(operator => operator.nama === name);
             return operator ? operator.id : undefined;
       } catch (error) {
          console.error(`Error finding operator ID by name ${name} and category ID ${categoryId}:`, error?.message || error);
         throw error;
       }
    }
    /**
     * Fetches the list of product types for a given operator from TokoVoucher API.
     * @param {string} operatorId
     * @returns {Promise<any[]>}
     */
      async function getJenis(operatorId) {
          const { memberCode, signature } = tokoVoucher;
          const params = generateMemberParams(memberCode, signature, { id: operatorId });
        try {
             const response = await tovGet('/member/produk/jenis/list', params);
           const sortedData = response.data.data.sort((a, b) => a.price - b.price);
           return sortedData;
       } catch (error) {
           console.error(`Error fetching product types for operator ID ${operatorId}:`, toSafeAxiosError(error));
           throw error;
       }
     }
    /**
     * Finds a product type ID by its name and operator ID from TokoVoucher API.
     * @param {string} name
     * @param {string} operatorId
     * @returns {Promise<string|undefined>}
     */
    async function findIdJenisByName(name, operatorId) {
      try {
            const productTypes = await getJenis(operatorId);
             const productType = productTypes.find(item => item.nama === name);
            return productType ? productType.id : undefined;
        } catch (error) {
          console.error(`Error finding product type ID by name ${name} and operator ID ${operatorId}:`, error?.message || error);
           throw error;
        }
   }
     /**
     * Fetches the list of products for a given product type from TokoVoucher API.
     * @param {string} productTypeId
     * @returns {Promise<any[]>}
     */
     async function getListJenis(productTypeId) {
         const { memberCode, signature } = tokoVoucher;
        const params = generateMemberParams(memberCode, signature, { id_jenis: productTypeId });
       try {
         const response = await tovGet('/member/produk/list', params);
         const sortedData = response.data.data.sort((a, b) => a.price - b.price);
         return sortedData;
      } catch (error) {
         console.error(`Error fetching product list for product type ID ${productTypeId}:`, toSafeAxiosError(error));
            throw error;
       }
   }
    /**
     * Finds a product code by its name and product type ID from TokoVoucher API.
     * @param {string} name
     * @param {string} productTypeId
     * @returns {Promise<string|undefined>}
     */
     async function findIdListJenisByName(name, productTypeId) {
      try {
        const products = await getListJenis(productTypeId);
        const product = products.find((item) => item.nama_produk === name);
          return product ? product.code : undefined;
       }
       catch (error) {
            console.error(`Error finding product code by name ${name} and product type ID ${productTypeId}:`, error?.message || error);
            throw error;
        }
    }
     /**
     * Generates a unique reference ID.
     * @returns {string}
     */
    async function getRefId() {
        // Format: TV<YYYYMMDDHHMMSS><NNN>
        return generateRefId('TV');
    }
    /**
     * Creates a transaction with TokoVoucher API.
     * Uses POST per docs (https://docs.tokovoucher.net/transaksi/post):
     *   POST https://api.tokovoucher.net/v1/transaksi
     *   body: { ref_id, produk, tujuan, server_id, member_code, signature }
     *   signature = md5(MEMBER_CODE:SECRET:REF_ID)
     * Secret is never sent over the wire (only signature hash).
     * Set TOV_USE_GET=1 to fall back to legacy GET with secret in query.
     * @param {string} refId
     * @param {string} productCode
     * @param {string} destinationNumber
     * @param {string} serverId
     * @returns {Promise<any>}
     */
    async function createTrx(refId, productCode, destinationNumber, serverId = "") {
      const { secret, memberCode } = tokoVoucher;
      if (!memberCode || !secret) {
        throw new Error('Missing TokoVoucher credentials (member_code/secret)');
      }
      try {
        if (process.env.TOV_USE_GET === '1') {
          // Legacy fallback: GET with secret in query (kept for compatibility only)
          const params = {
            ref_id: refId,
            produk: productCode,
            tujuan: destinationNumber,
            secret,
            member_code: memberCode,
            server_id: serverId,
          };
          const response = await tovGet('/v1/transaksi', params);
          return response.data;
        }
        const signature = generateSignature(memberCode, secret, refId);
        const body = {
          ref_id: refId,
          produk: productCode,
          tujuan: destinationNumber,
          server_id: serverId || '',
          member_code: memberCode,
          signature,
        };
        const response = await tovPost('/v1/transaksi', body);
        return response.data;
      } catch (error) {
        console.error('Error creating transaction:', toSafeAxiosError(error));
        throw error;
      }
  }
   /**
     * Fetches account balance from TokoVoucher API.
     * @returns {Promise<number>}
     */
    async function checkSaldo() {
        const { memberCode, signature } = tokoVoucher;
        const params = generateMemberParams(memberCode, signature);
       try {
             const response = await tovGet('/member', params);
             const { data } = response;
                if(data.status !== 1){
                    throw new Error(`Error !! : ${data.error_msg}`);
                }
             return data.data.saldo;
        } catch (error) {
            console.error('Error checking balance:', toSafeAxiosError(error));
            throw error;
      }
  }

    /**
    * Helper function to format number with commas for thousands separator
    * @param {number} x
    * @returns {string}
    */
function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

module.exports = {
    getKategori,
    findIdByName,
    getOperatorByCategory,
    findIdOperatorByName,
    getJenis,
    findIdJenisByName,
    getListJenis,
    findIdListJenisByName,
    getRefId,
    createTrx,
    checkSaldo,
    numberWithCommas
};
