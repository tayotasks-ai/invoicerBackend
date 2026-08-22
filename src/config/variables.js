const PAYSTACK_URL = process.env.PAYSTACK_URL || 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'your-paystack-secret-key';

module.exports = {
    PAYSTACK_SECRET_KEY,
    PAYSTACK_URL,
}