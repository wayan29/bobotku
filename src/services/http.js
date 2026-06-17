const crypto = require('crypto'); // Node built-in
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const DgCache = require('../models/dgcache');
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
     * Fetches the list of product categories from MongoDB dgcache collection.
     * @param {boolean} forceRefresh - Not used anymore, kept for compatibility
     * @returns {Promise<string[]>}
     */
   async function getListProductDigi(forceRefresh = false) {
        try {
            console.log('Fetching product categories from database...');

            // Get distinct categories from database
            const categories = await DgCache.distinct('category');

            if (categories.length === 0) {
                console.warn('No categories found in database. Please run /reloaddg to populate data.');
                return [];
            }

            console.log(`Found ${categories.length} categories in database`);
            return categories;
        } catch (error) {
            console.error('Error fetching product categories from database:', error?.message || error);
            return [];
        }
    };
     /**
     * Fetches the list of brands for a given category from MongoDB dgcache collection.
     * @param {string} category
     * @returns {Promise<string[]>}
     */
    async function getListBrand (category) {
        try {
            console.log(`Fetching brands for category: ${category}`);

            // Get distinct brands for the specified category
            const brands = await DgCache.distinct('brand', { category: category });

            if (brands.length === 0) {
                console.warn(`No brands found for category ${category}`);
                return [];
            }

            console.log(`Found ${brands.length} brands for category ${category}`);
            return brands;
        } catch (error) {
            console.error(`Error fetching brands for category ${category}:`, error?.message || error);
            return [];
        }
    };
    /**
     * Fetches the list of products for a given category and brand from MongoDB dgcache collection.
     * @param {string} category
     * @param {string} brand
     * @returns {Promise<any[]>}
     */
     async function getProductList (category, brand) {
        try {
            console.log(`Fetching products for category: ${category}, brand: ${brand}`);

            // Query products from database and sort by price
            const products = await DgCache.find({
                category: category,
                brand: brand
            }).sort({ price: 1 }).lean();

            if (products.length === 0) {
                console.warn(`No products found for category ${category} and brand ${brand}`);
                return [];
            }

            console.log(`Found ${products.length} products`);
            return products;
        } catch (error) {
            console.error(`Error fetching products for ${category} and ${brand}:`, error?.message || error);
            return [];
        }
    };
      /**
     * Fetches the price of a specific product from MongoDB dgcache collection.
     * @param {string} productName
     * @returns {Promise<any[]>}
     */
    async function getPrice (productName) {
        try {
            console.log(`Fetching price for product: ${productName}`);

            // Query product by name
            const products = await DgCache.find({
                product_name: productName
            }).lean();

            if (products.length === 0) {
                console.warn(`Product not found: ${productName}`);
                return [];
            }

            return products;
        } catch (error) {
            console.error(`Error fetching price for product ${productName}:`, error?.message || error);
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
        console.error('Message:', error.response?.data?.data?.message || error.response.data);
            return error.response.data.data;
        } else if (error.request) {
          // No response received
          console.error('No response received for transaction request');
        } else {
          // Error in setting up the request
          console.error('Error:', error?.message || error);
          }
           return {
              status: 'Gagal',
                message : `Terjadi Kesalahan ${error?.message || error}`
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

/**
 * Reloads pricelist from Digiflazz API and saves to MongoDB dgcache collection.
 * This function should be called via /reloaddg command.
 * @returns {Promise<{success: boolean, message: string, stats: object}>}
 */
async function reloadPricelistFromAPI() {
    const { baseUrl, username, apiKey } = digiflazz;
    const endpoint = `${baseUrl}/v1/price-list`;
    const cmd = 'prepaid';
    const sign = generateSign(username, apiKey, 'pricelist');

    try {
        console.log('Fetching fresh pricelist from Digiflazz API...');

        const data = { cmd, username, sign };
        const response = await axios.post(endpoint, data, {
            headers: { 'Content-Type': 'application/json' }
        });

        const responseData = response.data;

        if (!responseData.data || !Array.isArray(responseData.data)) {
            throw new Error('Invalid response format from Digiflazz API');
        }

        const products = responseData.data;
        console.log(`Received ${products.length} products from API`);

        // Clear old data and insert new data
        console.log('Clearing old data from database...');
        await DgCache.deleteMany({});

        console.log('Inserting new data to database...');
        const bulkOps = products.map(product => ({
            updateOne: {
                filter: { buyer_sku_code: product.buyer_sku_code },
                update: {
                    $set: {
                        product_name: product.product_name,
                        category: product.category,
                        brand: product.brand,
                        type: product.type,
                        seller_name: product.seller_name,
                        price: product.price,
                        buyer_sku_code: product.buyer_sku_code,
                        buyer_product_status: product.buyer_product_status,
                        seller_product_status: product.seller_product_status,
                        unlimited_stock: product.unlimited_stock,
                        stock: product.stock,
                        multi: product.multi,
                        start_cut_off: product.start_cut_off || '',
                        end_cut_off: product.end_cut_off || '',
                        desc: product.desc || '',
                        last_updated: new Date()
                    }
                },
                upsert: true
            }
        }));

        const result = await DgCache.bulkWrite(bulkOps);

        // Get statistics
        const totalProducts = await DgCache.countDocuments();
        const totalCategories = (await DgCache.distinct('category')).length;
        const totalBrands = (await DgCache.distinct('brand')).length;

        const stats = {
            totalProducts,
            totalCategories,
            totalBrands,
            inserted: result.upsertedCount,
            updated: result.modifiedCount
        };

        console.log('Pricelist reload completed successfully:', stats);

        return {
            success: true,
            message: 'Pricelist berhasil diperbarui dari Digiflazz API',
            stats
        };

    } catch (error) {
        console.error('Error reloading pricelist:', error?.message || error);
        return {
            success: false,
            message: `Gagal memperbarui pricelist: ${error.message}`,
            stats: null
        };
    }
}

module.exports = {
   getListProductDigi,
   getListBrand,
   getProductList,
   getPrice,
   performTransaction,
   checkSaldoDigi,
   numberWithCommas,
   reloadPricelistFromAPI,
};