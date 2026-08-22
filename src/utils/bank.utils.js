const axios = require('axios');
const { PAYSTACK_SECRET_KEY, PAYSTACK_URL } = require('../config/variables');


const listBanks = () => {
    return new Promise((resolve, reject) => {
        axios
        .get(`${PAYSTACK_URL}/bank`, {
            headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            },
        })
        .then((response) => {
            resolve(response.data);
        })
        .catch((error) => {
            reject(error);
        });
    });
}

const verifyBankAccount = (accountNumber, bankCode) => {
    return new Promise((resolve, reject) => {
        axios
        .get(`${PAYSTACK_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
            headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            },
        })
        .then((response) => {
            resolve(response.data);
        })
        .catch((error) => {
            reject(error);
        });
    });
}

module.exports = {
    listBanks,
    verifyBankAccount,
}