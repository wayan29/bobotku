const { Markup } = require('telegraf');

const showKeyboard = (data) => {
    const categories = data;
    return Markup.keyboard(categories.map(category => [category])).oneTime().resize();
};
// 
const showKeyboardChunk = (data, size = 3) => {
    const categories = data;
    const chunkedCategories = [];
    let index = 0;
    while (index < categories.length) {
        chunkedCategories.push(categories.slice(index, index + size));
        index += size;
    }
    return Markup.keyboard(chunkedCategories).oneTime().resize();
};


function splitList(list, chunkSize) {
    const chunks = [];
    for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        chunks.push(chunk);
    }
    return chunks;
}

function formatCurrency(amount) {
    const formatter = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    });

    return formatter.format(amount).replace(/IDR/g, 'Rp');
}

module.exports = {
    showKeyboard,
    showKeyboardChunk,
    splitList,
    formatCurrency
};
