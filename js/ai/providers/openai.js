/*
 * OpenAI Provider — Sprint 3 Requirement #1, kiến trúc Cloud Function Proxy
 * (quyết định của Chief Architect sau khi phát hiện rủi ro lưu API Key phía
 * client — xem ARCHITECTURE_REVIEW_SPRINT3.md). Vẫn implement đúng
 * IAIProvider (generate/validate/health, không thêm phương thức nào khác)
 * — chỉ đổi điểm kết nối bên trong: gọi Cloud Function `openaiProxy`
 * (functions/index.js) thay vì gọi thẳng OpenAI. API Key OpenAI KHÔNG BAO
 * GIỜ xuất hiện ở file này hay bất kỳ đâu phía client.
 *
 *   Browser (CMS) → Cloud Function Proxy (openaiProxy) → OpenAI API
 *
 * TODO sau khi deploy Cloud Function lần đầu: thay đúng URL thật (Firebase
 * CLI in ra sau khi `firebase deploy --only functions` chạy xong) vào hằng
 * số OPENAI_PROXY_URL bên dưới.
 */
const OPENAI_PROXY_URL = 'https://us-central1-pshop-music.cloudfunctions.net/openaiProxy';

function callOpenAiProxy(body) {
  return firebase.auth().currentUser.getIdToken().then(idToken => {
    return fetch(OPENAI_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + idToken
      },
      body: JSON.stringify(body)
    }).then(res => res.json().then(data => ({ ok: res.ok, data })));
  });
}

AIProviderRegistry.register({
  id: 'openai',
  label: 'OpenAI',

  validate(config) {
    if (!config || !config.enabled) {
      return { valid: false, reason: 'OpenAI chưa được bật trong Nhà cung cấp AI (admin/ai/providers.html).' };
    }
    if (typeof firebase === 'undefined' || !firebase.auth().currentUser) {
      return { valid: false, reason: 'Chưa đăng nhập CMS — cần đăng nhập để gọi Cloud Function Proxy.' };
    }
    return { valid: true, reason: '' };
  },

  health() {
    return callOpenAiProxy({ action: 'health' }).then(({ ok, data }) => {
      if (!ok) return { healthy: false, message: data.error || 'Cloud Function Proxy báo lỗi.' };
      return data;
    }).catch(err => ({ healthy: false, message: 'Không gọi được Cloud Function Proxy: ' + err.message }));
  },

  generate({ moduleId, prompt, params, config }) {
    if (!config || !config.enabled) return Promise.reject(createProviderNotConfiguredError('OpenAI'));
    return callOpenAiProxy({ action: 'generate', model: config.model || 'gpt-4o-mini', prompt }).then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Cloud Function Proxy báo lỗi.');
      if (!data.text) throw new Error('OpenAI trả về kết quả rỗng.');
      return { text: data.text, raw: data.raw };
    });
  }
});
