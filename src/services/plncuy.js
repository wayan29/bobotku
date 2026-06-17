const crypto = require("crypto");
const axios = require("axios");
require("dotenv").config();

// Load environment variables from .env file
const getDataFromAPI = async (noPelanggan) => {
    const username = process.env.username; // Pastikan nama variabel sama dengan di file .env
    const apiKey = process.env.apikey;

    if (!username || !apiKey) {
        throw new Error("USERNAME atau API_KEY tidak ditemukan di file .env");
    }

    // Generate sign using MD5 hash
    const sign = crypto.createHash("md5").update(username + apiKey + noPelanggan).digest("hex");

    // Data request
    const requestData = {
        username: username,
        customer_no: noPelanggan,
        sign: sign
    };

    // API endpoint
    const endpoint = "https://api.digiflazz.com/v1/inquiry-pln";

    try {
        // Make the Axios POST request
        const response = await axios.post(endpoint, requestData, {
            headers: {
                "Content-Type": "application/json"
            }
        });

        // Extract relevant information
        const data = response.data;
        if (data && data.data) {
            return data.data; // Return relevant data
        } else {
            console.log("No data found or response is invalid.");
            return null;
        }
    } catch (error) {
        console.error("An error occurred:", error.message);
        throw error;
    }
};

module.exports = getDataFromAPI; // Ubah export agar sesuai dengan CommonJS
