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
  const SEED_PROVIDER_CONFIG = {
    activeProvider: 'none',
    providers: {
      openai: { enabled: false, model: '' },
      claude: { enabled: false, model: '' },
      gemini: { enabled: false, model: '' },
      deepseek: { enabled: false, model: '' }
    }
  };
  return {
    get() {
      return ref().once('value').then(snap => snap.val() || SEED_PROVIDER_CONFIG);
    },
    save(config) {
      return ref().set(config).then(() => true);
    }
  };
})();
