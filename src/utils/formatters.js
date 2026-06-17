/**
 * Format number with commas for currency display
 * @param {number} x - Number to format
 * @returns {string} Formatted number with commas
 */
function numberWithCommas(x) {
    try {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    } catch (error) {
        return "0";
    }
}

/**
 * Format number as currency with IDR format
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
    const formatter = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    });
    return formatter.format(amount);
}

module.exports = {
    numberWithCommas,
    formatCurrency
};
