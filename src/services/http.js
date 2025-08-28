const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const digiflazz = {
    baseUrl: 'https://api.digiflazz.com',
    username: process.env.username,
    apiKey: process.env.apikey,
    cacheFile: 'cache/digiflazz.json',
};

    /**
     * Helper function to generate MD5 sign
     * @param {string} username
     * @param {string} apiKey
     * @param {string} command
     * @returns {string}
     */
 const generateSign = (username, apiKey, command) => {
    return crypto
        .createHash('md5')
         .update(username + apiKey + command)
         .digest('hex');
 };
    /**
     * Fetches the list of product categories from Digiflazz API or cache.
     * @param {boolean} forceRefresh - If true, always fetch fresh data from API
     * @returns {Promise<string[]>}
     */
   async function getListProductDigi(forceRefresh = false) {
        const { cacheFile, baseUrl, username, apiKey } = digiflazz;
        const endpoint = `${baseUrl}/v1/price-list`;
        const cmd = 'prepaid';
        const sign = generateSign(username, apiKey, 'pricelist');
        
    try {
            let json;
            
            // Ensure cache directory exists
            const cacheDir = path.dirname(cacheFile);
            await fs.mkdir(cacheDir, { recursive: true });
            
            // If forceRefresh is true, always fetch from API
            if (forceRefresh) {
                console.log('Force refresh: Fetching fresh product data from Digiflazz API...');
                const data = { cmd, username, sign };
                const response = await axios.post(endpoint, data);
                json = response.data;
                
                // Save to cache
                await fs.writeFile(cacheFile, JSON.stringify(json, null, 2));
            } else {
                // Check if cache file exists and try to read from it first
                const cacheExists = await fs.access(cacheFile).then(() => true).catch(() => false);
                
                if (cacheExists) {
                    try {
                        // Try to read from cache first
                        const cachedData = await fs.readFile(cacheFile, 'utf-8');
                        json = JSON.parse(cachedData);
                        
                        // If cache is valid, return categories from cache
                        if (json.data && Array.isArray(json.data)) {
                            console.log('Using cached product data');
                            const categories = Array.from(new Set(json.data.map(({ category }) => category)));
                            return categories;
                        }
                    } catch (cacheError) {
                        console.log('Cache file exists but is invalid, fetching fresh data');
                    }
                }
                
                // If no cache or cache is invalid, fetch from API
                console.log('Fetching fresh product data from Digiflazz API...');
                const data = { cmd, username, sign };
                const response = await axios.post(endpoint, data);
                json = response.data;
                
                // Save to cache
                await fs.writeFile(cacheFile, JSON.stringify(json, null, 2));
            }
            
             // Check if we have valid product data
            if (json.data && Array.isArray(json.data)) {
                const categories = Array.from(new Set(json.data.map(({ category }) => category)));
                return categories;
            } else if (json.data && json.data.rc) {
                // Handle API error response
                console.error('Digiflazz API Error:', json.data.message);
                throw new Error(json.data.message);
            } else {
                console.error('Invalid response format from Digiflazz');
                return [];
            }
        } catch (error) {
             console.error('Error fetching product categories:', error);
             return [];
        }
    };
     /**
     * Fetches the list of brands for a given category from Digiflazz API cache.
     * @param {string} category
     * @returns {Promise<string[]>}
     */
    async function getListBrand (category) {
      const { cacheFile } = digiflazz;
      try {
          // Ensure cache directory exists
          const cacheDir = path.dirname(cacheFile);
          await fs.mkdir(cacheDir, { recursive: true });
          
          const data = await fs.readFile(cacheFile, 'utf-8');
        const { data : productData } = JSON.parse(data);
        const filteredData = productData.filter((item) => item.category === category);
        const brands = Array.from(new Set(filteredData.map((item) => item.brand)));
          return brands;
      }
      catch (error) {
            console.error(`Error fetching brands for category ${category}:`, error);
          return [];
      }
    };
    /**
     * Fetches the list of products for a given category and brand from Digiflazz API cache.
     * @param {string} category
     * @param {string} brand
     * @returns {Promise<any[]>}
     */
     async function getProductList (category, brand) {
        const { cacheFile } = digiflazz;
        try {
            // Ensure cache directory exists
            const cacheDir = path.dirname(cacheFile);
            await fs.mkdir(cacheDir, { recursive: true });
            
            const data = await fs.readFile(cacheFile, 'utf-8');
            const { data : productData } = JSON.parse(data);
            const filteredData = productData.filter(item => item.category === category && item.brand === brand);
            // Sort by price in ascending order
            filteredData.sort((a, b) => a.price - b.price);
            return filteredData;
        } catch (error) {
            console.error(`Error fetching products for ${category} and ${brand}:`, error);
          return [];
        }
    };
      /**
     * Fetches the price of a specific product from Digiflazz API cache.
     * @param {string} productName
     * @returns {Promise<any[]>}
     */
    async function getPrice (productName) {
      const { cacheFile } = digiflazz;
       try {
            // Ensure cache directory exists
            const cacheDir = path.dirname(cacheFile);
            await fs.mkdir(cacheDir, { recursive: true });
            
            const data = await fs.readFile(cacheFile, 'utf-8');
            const { data : productData } = JSON.parse(data);
            const filteredData = productData.filter(item => item.product_name === productName);
            return filteredData;
        } catch (error) {
             console.error(`Error fetching price for product ${productName}:`, error);
           return [];
        }
     };
      /**
       * Performs a transaction with Digiflazz API.
       * @param {string} refId
       * @param {string} buyerSkuCode
       * @param {string} customerNumber
       * @returns {Promise<any>}
       */
     async function performTransaction (refId, buyerSkuCode, customerNumber) {
        const { baseUrl, username, apiKey } = digiflazz;
         const endpointTransaksi = `${baseUrl}/v1/transaction`;
        const sign = generateSign(username, apiKey, refId);

          const dataTransaksi = {
            ref_id: refId,
            username: username,
            buyer_sku_code: buyerSkuCode,
            customer_no: customerNumber,
            sign,
        };
        try {
            const response = await axios.post(endpointTransaksi, dataTransaksi, {
              headers: { 'Content-Type': 'application/json' },
           });
          return response.data.data;
        } catch (error) {
        if (error.response) {
          // Response with unsuccessful status code
        console.error('Status code:', error.response.status);
        console.error('Message:', error.response.data.data.message);
            return error.response.data.data;
        } else if (error.request) {
          // No response received
          console.error('No response received:', error.request);
        } else {
          // Error in setting up the request
          console.error('Error:', error.message);
          }
           return {
              status: 'Gagal',
                message : `Terjadi Kesalahan ${error.message}`
           }
       }
     };
     /**
     * Fetches account balance from Digiflazz API.
     * @returns {Promise<number>}
     */
     async function checkSaldoDigi () {
        const { baseUrl, username, apiKey } = digiflazz;
        const endpointsal = `${baseUrl}/v1/cek-saldo`;
        const cmd1 = 'deposit';
        const sign = generateSign(username, apiKey, 'depo');
          const data = { cmd: cmd1, username, sign };
           try {
                const response = await axios.post(endpointsal, data, {
                    headers: { 'Content-Type': 'application/json' },
                });
                const { data : responseData } = response.data;
                 if (responseData && responseData.deposit !== undefined) {
                    return responseData.deposit;
                } else {
                     throw new Error('Error: ' + response.data.message);
                }
            } catch (error) {
                 console.error('Error checking balance:', error.message);
                  throw error;
            }
    };
  /**
    * Helper function to format number with commas for thousands separator
    * @param {number} x
    * @returns {string}
    */
function numberWithCommas(x) {
    if (typeof x !== 'number' || isNaN(x)) {
        return "N/A"; // Or "Harga tidak tersedia", or 0, depending on desired behavior
    }
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

module.exports = {
   ...digiflazz,
   getListProductDigi,
   getListBrand,
   getProductList,
   getPrice,
   performTransaction,
   checkSaldoDigi,
   numberWithCommas,
};
