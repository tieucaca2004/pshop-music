// API-01 (PAY-1) — unit: mọi payment adapter + fallback mock đều FAIL-CLOSED
// ở verifyWebhook (chưa có contract chữ ký provider thật). Không cần emulator.
// Chạy: node tests/payment-adapters.test.js
'use strict';
const path = require('path');
const { getAdapter, listProviders } = require(path.join(__dirname, '..', 'functions', 'shared', 'paymentAdapters.js'));
(async () => {
  const out = []; const R = (n, pass, info) => out.push((pass ? 'PASS ' : 'FAIL ') + n + (info ? ' | ' + info : ''));
  const providers = listProviders().concat(['abc', '', 'unknown_provider']);
  const forged = { transactionId: 'TX', vnp_TxnRef: 'TX', orderId: 'TX', apptransid: 'TX', id: 'TX', status: 'paid', event: 'payment.completed' };
  for (const p of providers) {
    const r = await getAdapter(p).verifyWebhook(forged, 'any-secret');
    R('verifyWebhook(' + (p || '<rỗng>') + ') từ chối', r && r.valid === false && !r.transactionId, JSON.stringify(r));
  }
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'functions', 'shared', 'paymentAdapters.js'), 'utf8');
  R('không còn verifyWebhook trả valid:true', !/valid:\s*true/.test(src));
  console.log(out.join('\n'));
  const f = out.filter(l => l.startsWith('FAIL')).length;
  console.log(f ? f + ' FAILED' : 'payment-adapters: ' + out.length + '/' + out.length + ' PASS');
  process.exit(f ? 1 : 0);
})();
