'use strict';

/*
 * Test cho shared/fbConnectionPatch.js — hàm thuần, không cần Firebase.
 * Chạy: node --test functions/tests/fbConnectionPatch.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const { buildActiveTokenPatch, buildConnectionPatch } = require('../shared/fbConnectionPatch');

const DAY = 24 * 3600 * 1000;
const NOW = 1793000000000;
const EXP = NOW + 60 * DAY;

/* ---------- buildActiveTokenPatch ---------- */

test('AT1: token hợp lệ, pageId đúng, kết nối thật -> patch đầy đủ', () => {
  const r = buildActiveTokenPatch({
    active: { pageId: '111222333', isMock: false },
    matchingPage: { id: '111222333', access_token: 'EAAtoken' },
    expiresAt: EXP,
    mockMode: false
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.patch.pageId, '111222333');
  assert.strictEqual(r.patch.accessToken, 'EAAtoken');
  assert.strictEqual(r.patch.expiresAt, EXP);
  assert.strictEqual(r.patch.isMock, false);
  assert.ok(Number.isFinite(r.patch.obtainedAt));
});

test('AT2: thiếu pageId trong active -> ok:false', () => {
  const r = buildActiveTokenPatch({
    active: { accessToken: 'x' },
    matchingPage: { id: '111', access_token: 'tok' },
    expiresAt: EXP
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ACTIVE_PAGE_ID_MISSING');
});

test('AT3: thiếu access_token từ Graph -> ok:false', () => {
  const r = buildActiveTokenPatch({
    active: { pageId: '111' },
    matchingPage: { id: '111' },
    expiresAt: EXP
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'PAGE_ACCESS_TOKEN_MISSING');
});

test('AT4: pageId KHÔNG khớp -> không trả token (chống ghi nhầm Fanpage)', () => {
  const r = buildActiveTokenPatch({
    active: { pageId: '111' },
    matchingPage: { id: '999', access_token: 'TOKEN_CUA_TRANG_KHAC' },
    expiresAt: EXP
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'PAGE_ID_MISMATCH');
  assert.strictEqual(r.patch, undefined);
});

test('AT5: mockMode true KHÔNG bị đổi thành false', () => {
  const r = buildActiveTokenPatch({
    active: { pageId: '111', isMock: true },
    matchingPage: { id: '111', access_token: 'mock_token' },
    expiresAt: EXP,
    mockMode: true
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.patch.isMock, true);
});

test('AT6: mockMode undefined -> giữ false, không tự bật', () => {
  const r = buildActiveTokenPatch({
    active: { pageId: '111' },
    matchingPage: { id: '111', access_token: 'tok' },
    expiresAt: EXP
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.patch.isMock, false);
});

test('AT7: expiresAt không hợp lệ -> ok:false', () => {
  const r = buildActiveTokenPatch({
    active: { pageId: '111' },
    matchingPage: { id: '111', access_token: 'tok' },
    expiresAt: NaN
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'EXPIRES_AT_INVALID');
});

test('AT8: active null/undefined -> ok:false, không throw', () => {
  assert.strictEqual(buildActiveTokenPatch({ matchingPage: {}, expiresAt: EXP }).code, 'ACTIVE_PAGE_ID_MISSING');
  assert.strictEqual(buildActiveTokenPatch({ active: null, matchingPage: {}, expiresAt: EXP }).code, 'ACTIVE_PAGE_ID_MISSING');
});

/* ---------- buildConnectionPatch ---------- */

test('CP1: activeAfter đầy đủ -> báo connected', () => {
  const r = buildConnectionPatch({
    activeAfter: { pageId: '111', accessToken: 'tok' },
    expiresAt: EXP,
    mockMode: false
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.patch.status, 'connected');
  assert.strictEqual(r.patch.pageId, '111');
  assert.strictEqual(r.patch.tokenExpiresAt, EXP);
  assert.strictEqual(r.patch.isMock, false);
});

test('CP2: thiếu accessToken -> KHÔNG báo connected', () => {
  const r = buildConnectionPatch({
    activeAfter: { pageId: '111' },
    expiresAt: EXP,
    mockMode: false
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'CANNOT_MARK_CONNECTED');
  assert.strictEqual(r.patch, undefined);
});

test('CP3: thiếu pageId -> KHÔNG báo connected', () => {
  const r = buildConnectionPatch({
    activeAfter: { accessToken: 'tok' },
    expiresAt: EXP,
    mockMode: false
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'CANNOT_MARK_CONNECTED');
});

test('CP4: activeAfter null -> KHÔNG báo connected', () => {
  const r = buildConnectionPatch({ activeAfter: null, expiresAt: EXP });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'CANNOT_MARK_CONNECTED');
});

test('CP5: mock mode giữ nguyên true khi ghi connection', () => {
  const r = buildConnectionPatch({
    activeAfter: { pageId: '111', accessToken: 'mock' },
    expiresAt: EXP,
    mockMode: true
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.patch.isMock, true);
});

test('CP6: expiresAt không hợp lệ -> ok:false', () => {
  const r = buildConnectionPatch({
    activeAfter: { pageId: '111', accessToken: 'tok' },
    expiresAt: Infinity
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'EXPIRES_AT_INVALID');
});
