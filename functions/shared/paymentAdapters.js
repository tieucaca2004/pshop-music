/*
 * shared/paymentAdapters.js — Payment Provider Adapters (Phase 3, Task 12.0).
 *
 * Provider Adapter Architecture: a common interface for all payment providers.
 * Each adapter exposes the same methods. Initially returns mock/demo responses.
 * Real API integration can be added later without changing business logic.
 *
 * Interface:
 *   createPayment(order, tenantConfig) -> { success, transactionId, qrCode, paymentUrl, ... }
 *   checkStatus(transactionId, tenantConfig) -> { status, ... }
 *   cancelPayment(transactionId, tenantConfig) -> { success, ... }
 *   refundPayment(transactionId, amount, tenantConfig) -> { success, ... }
 *   verifyWebhook(payload, secret) -> { valid, event, transactionId }
 */

const crypto = require('crypto');

/**
 * Mock adapter — returns simulated responses for demos and development.
 * Replace each method with real API calls when integrating a provider.
 */
const mockAdapter = {
  name: 'Mock',

  async createPayment(order, config) {
    const transactionId = 'MOCK-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomUUID().slice(0, 8);
    return {
      success: true,
      transactionId: transactionId,
      paymentUrl: null,
      qrCode: null,
      message: 'Thanh toán mô phỏng thành công (Mock Mode)'
    };
  },

  async checkStatus(transactionId) {
    return { status: 'paid', transactionId, message: 'Mock: giao dịch đã thanh toán.' };
  },

  async cancelPayment(transactionId) {
    return { success: true, transactionId, message: 'Mock: giao dịch đã hủy.' };
  },

  async refundPayment(transactionId, amount) {
    return { success: true, transactionId, amount, message: 'Mock: hoàn tiền ' + amount + ' thành công.' };
  },

  async verifyWebhook(payload) {
    return { valid: true, event: 'payment.completed', transactionId: payload.transactionId || '' };
  }
};

/**
 * Cash adapter — simple cash-on-delivery with no external API.
 */
const cashAdapter = {
  name: 'Cash',

  async createPayment(order) {
    const transactionId = 'CASH-' + Date.now().toString(36).toUpperCase();
    return {
      success: true,
      transactionId: transactionId,
      paymentUrl: null,
      qrCode: null,
      message: 'Thanh toán tiền mặt. Thu ngân sẽ xác nhận khi nhận tiền.'
    };
  },

  async checkStatus(transactionId) {
    return { status: 'pending', transactionId };
  },

  async cancelPayment(transactionId) {
    return { success: true, transactionId, message: 'Đã hủy giao dịch tiền mặt.' };
  },

  async refundPayment(transactionId, amount) {
    return { success: true, transactionId, amount, message: 'Hoàn tiền mặt: ' + amount };
  },

  async verifyWebhook(payload) {
    return { valid: true, event: 'payment.completed', transactionId: payload.transactionId || '' };
  }
};

/**
 * Bank Transfer adapter — generates a virtual bank account number.
 */
const bankTransferAdapter = {
  name: 'BankTransfer',

  async createPayment(order, config) {
    const transactionId = 'BANK-' + Date.now().toString(36).toUpperCase();
    const bankAccount = config && config.bankAccount
      ? config.bankAccount
      : { bank: 'Vietcombank', accountNumber: '1234567890', accountName: 'PSH Platform' };
    return {
      success: true,
      transactionId: transactionId,
      paymentUrl: null,
      qrCode: null,
      bankAccount: bankAccount,
      message: 'Chuyển khoản đến ' + bankAccount.bank + ' Số TK: ' + bankAccount.accountNumber
    };
  },

  async checkStatus(transactionId) {
    return { status: 'pending', transactionId };
  },

  async cancelPayment(transactionId) {
    return { success: true, transactionId };
  },

  async refundPayment(transactionId, amount) {
    return { success: true, transactionId, amount };
  },

  async verifyWebhook(payload) {
    return { valid: true, event: 'payment.completed', transactionId: payload.transactionId || '' };
  }
};

/**
 * VietQR adapter — generates VietQR payment link.
 */
const vietQrAdapter = {
  name: 'VietQR',

  async createPayment(order, config) {
    const transactionId = 'QR-' + Date.now().toString(36).toUpperCase();
    const bankInfo = config && config.bankInfo ? config.bankInfo : { bin: '970436', accountNumber: '1234567890' };
    const amount = order.total || 0;
    const qrContent = 'https://img.vietqr.io/image/' + bankInfo.bin + '-' + bankInfo.accountNumber
      + '-print.jpg?amount=' + amount + '&addInfo=' + encodeURIComponent('TT don ' + (order.orderNumber || ''));
    return {
      success: true,
      transactionId: transactionId,
      paymentUrl: qrContent,
      qrCode: qrContent,
      message: 'Quét mã VietQR để thanh toán.'
    };
  },

  async checkStatus(transactionId) {
    return { status: 'pending', transactionId };
  },

  async cancelPayment(transactionId) {
    return { success: true, transactionId };
  },

  async refundPayment(transactionId, amount) {
    return { success: true, transactionId, amount };
  },

  async verifyWebhook(payload) {
    return { valid: true, event: 'payment.completed', transactionId: payload.transactionId || '' };
  }
};

/**
 * VNPay adapter — stub for real VNPay integration.
 */
const vnpayAdapter = {
  name: 'VNPay',

  async createPayment(order, config) {
    const transactionId = 'VNP-' + Date.now().toString(36).toUpperCase();
    const returnUrl = config && config.returnUrl ? config.returnUrl : 'https://pshopmusic.com/payment/callback';
    return {
      success: true,
      transactionId: transactionId,
      paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=' + transactionId + '&vnp_Amount=' + (order.total || 0) * 100 + '&vnp_ReturnUrl=' + encodeURIComponent(returnUrl),
      qrCode: null,
      message: 'Chuyển hướng đến cổng VNPay.'
    };
  },

  async checkStatus(transactionId) {
    return { status: 'pending', transactionId };
  },

  async cancelPayment(transactionId) {
    return { success: true, transactionId };
  },

  async refundPayment(transactionId, amount) {
    return { success: true, transactionId, amount };
  },

  async verifyWebhook(payload) {
    return { valid: true, event: 'payment.completed', transactionId: payload.vnp_TxnRef || '' };
  }
};

/**
 * MoMo adapter — stub for real MoMo integration.
 */
const momoAdapter = {
  name: 'MoMo',

  async createPayment(order, config) {
    const transactionId = 'MOMO-' + Date.now().toString(36).toUpperCase();
    return {
      success: true,
      transactionId: transactionId,
      paymentUrl: 'https://test-payment.momo.vn/gw_payment/transactionProcessor?orderId=' + transactionId,
      qrCode: null,
      message: 'Chuyển hướng đến cổng MoMo.'
    };
  },

  async checkStatus(transactionId) {
    return { status: 'pending', transactionId };
  },

  async cancelPayment(transactionId) {
    return { success: true, transactionId };
  },

  async refundPayment(transactionId, amount) {
    return { success: true, transactionId, amount };
  },

  async verifyWebhook(payload) {
    return { valid: true, event: 'payment.completed', transactionId: payload.orderId || '' };
  }
};

/**
 * ZaloPay adapter — stub for real ZaloPay integration.
 */
const zaloPayAdapter = {
  name: 'ZaloPay',

  async createPayment(order, config) {
    const transactionId = 'ZLP-' + Date.now().toString(36).toUpperCase();
    return {
      success: true,
      transactionId: transactionId,
      paymentUrl: 'https://sbgate.zalopay.vn/pay?appid=2553&apptransid=' + transactionId,
      qrCode: null,
      message: 'Chuyển hướng đến cổng ZaloPay.'
    };
  },

  async checkStatus(transactionId) {
    return { status: 'pending', transactionId };
  },

  async cancelPayment(transactionId) {
    return { success: true, transactionId };
  },

  async refundPayment(transactionId, amount) {
    return { success: true, transactionId, amount };
  },

  async verifyWebhook(payload) {
    return { valid: true, event: 'payment.completed', transactionId: payload.apptransid || '' };
  }
};

/**
 * Stripe adapter — stub for real Stripe integration.
 */
const stripeAdapter = {
  name: 'Stripe',

  async createPayment(order, config) {
    const transactionId = 'STRIPE-' + Date.now().toString(36).toUpperCase();
    return {
      success: true,
      transactionId: transactionId,
      paymentUrl: 'https://checkout.stripe.com/pay/' + transactionId,
      qrCode: null,
      message: 'Chuyển hướng đến cổng Stripe.'
    };
  },

  async checkStatus(transactionId) {
    return { status: 'pending', transactionId };
  },

  async cancelPayment(transactionId) {
    return { success: true, transactionId };
  },

  async refundPayment(transactionId, amount) {
    return { success: true, transactionId, amount };
  },

  async verifyWebhook(payload) {
    return { valid: true, event: 'payment.completed', transactionId: payload.id || '' };
  }
};

/**
 * PayPal adapter — stub for real PayPal integration.
 */
const paypalAdapter = {
  name: 'PayPal',

  async createPayment(order, config) {
    const transactionId = 'PP-' + Date.now().toString(36).toUpperCase();
    return {
      success: true,
      transactionId: transactionId,
      paymentUrl: 'https://www.paypal.com/checkoutnow?token=' + transactionId,
      qrCode: null,
      message: 'Chuyển hướng đến cổng PayPal.'
    };
  },

  async checkStatus(transactionId) {
    return { status: 'pending', transactionId };
  },

  async cancelPayment(transactionId) {
    return { success: true, transactionId };
  },

  async refundPayment(transactionId, amount) {
    return { success: true, transactionId, amount };
  },

  async verifyWebhook(payload) {
    return { valid: true, event: 'payment.completed', transactionId: payload.id || '' };
  }
};

/**
 * Adapter registry — maps provider names to implementations.
 */
const ADAPTERS = {
  'cash': cashAdapter,
  'bank_transfer': bankTransferAdapter,
  'vietqr': vietQrAdapter,
  'vnpay': vnpayAdapter,
  'momo': momoAdapter,
  'zalopay': zaloPayAdapter,
  'stripe': stripeAdapter,
  'paypal': paypalAdapter
};

/**
 * Returns the adapter for the given provider.
 * Falls back to mock adapter if provider is unknown.
 */
function getAdapter(provider) {
  return ADAPTERS[provider] || mockAdapter;
}

/**
 * Lists all available providers.
 */
function listProviders() {
  return Object.keys(ADAPTERS).concat(['mock']).sort();
}

module.exports = { getAdapter, listProviders, ADAPTERS };
