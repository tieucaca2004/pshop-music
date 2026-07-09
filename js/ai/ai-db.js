/*
 * Data layer cho AI Assistant — tái sử dụng đúng factory makeListDB() đã có
 * trong js/cms-db.js (không viết lại logic CRUD), cộng 1 object-node DB
 * (ProviderConfigDB) theo đúng pattern SeoDB trong js/cms-db.js.
 * Yêu cầu load thứ tự: firebase-config.js → cms-db.js (định nghĩa
 * makeListDB) → file này.
 */
const DraftDB = makeListDB('aiDrafts', []);
const JobDB = makeListDB('aiJobs', []);
const LogDB = makeListDB('aiLogs', []);

const ProviderConfigDB = (function () {
  function ref() {
    return firebase.database().ref('aiProviderConfig');
  }

  // Sprint 11 Requirement #3.1 (AI Provider Initial Setup) — Founder không
  // cần hiểu "Provider" là gì để dùng được AI (Product Constitution: không
  // bắt Founder tự cấu hình Provider đầu tiên). Nếu CHƯA từng chọn Provider
  // nào (activeProvider còn 'none'/node chưa tồn tại), HOẶC đã chọn OpenAI
  // làm active nhưng quên bật checkbox "Bật OpenAI" (trạng thái không nhất
  // quán, không thể chạy được) — tự động khởi tạo về OpenAI + gpt-4o-mini,
  // CHỈ MỘT LẦN (điều kiện tự triệt tiêu sau khi đã khởi tạo, không cần cờ
  // riêng). KHÔNG BAO GIỜ ghi đè nếu Founder đã tự tay chọn 1 Provider khác
  // làm active (Claude/Gemini/DeepSeek) — đó là lựa chọn thật, chỉ Founder
  // tự đổi lại qua admin/ai/providers.html.
  const DEFAULT_OPENAI_CONFIG = { enabled: true, model: 'gpt-4o-mini' };

  function needsAutoInit(config) {
    if (!config || !config.activeProvider || config.activeProvider === 'none') return true;
    if (config.activeProvider === 'openai' && (!config.providers || !config.providers.openai || !config.providers.openai.enabled)) return true;
    return false;
  }

  function buildInitializedConfig(existing) {
    const base = (existing && typeof existing === 'object') ? existing : {};
    const providers = Object.assign(
      { claude: { enabled: false, model: '' }, gemini: { enabled: false, model: '' }, deepseek: { enabled: false, model: '' } },
      base.providers || {},
      { openai: DEFAULT_OPENAI_CONFIG }
    );
    return Object.assign({}, base, { activeProvider: 'openai', providers });
  }

  return {
    get() {
      return ref().once('value').then(snap => {
        const existing = snap.val();
        if (!needsAutoInit(existing)) return existing;
        const initialized = buildInitializedConfig(existing);
        return ref().set(initialized).then(() => initialized);
      });
    },
    save(config) {
      return ref().set(config).then(() => true);
    }
  };
})();
