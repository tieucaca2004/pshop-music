// WF-D1 — Chromium + Firebase Emulator: admin/ai/workflow.html chạy 2 step qua PermissionService → PluginManager → AIJobQueue (không mạng AI → step lỗi ở Provider, đúng hành vi). Xem tests/e2e/README.md.
// E2E admin/ai/workflow.html on Emulator: 2 steps (faq-generator, seo-generator). Real PermissionService/PluginManager/AIJobQueue.
const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const get = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
const keys = async p => Object.keys((await fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb&shallow=true', H).then(r => r.json())) || {});
(async () => {
  const b = await launch(); const { page, log } = await newPage(b);
  await login(page, 'admin@test.local');
  const jobs0 = await keys('aiJobs'), logs0 = await keys('aiLogs');
  await page.goto(BASE + '/admin/ai/workflow.html');
  await page.waitForFunction(() => document.querySelectorAll('[data-step-plugin] option').length > 1, null, { timeout: 20000 });
  await page.selectOption('[data-step-plugin="0"]', 'faq-generator');
  await page.waitForSelector('#wf-0-topic', { timeout: 10000 });
  await page.fill('#wf-0-topic', 'TEST_WF câu hỏi loa');
  await page.click('#wfAddStepBtn');
  await page.waitForSelector('[data-step-plugin="1"]', { timeout: 10000 });
  await page.selectOption('[data-step-plugin="1"]', 'faq-generator');
  await page.waitForSelector('#wf-1-topic', { timeout: 10000 });
  await page.fill('#wf-0-topic', 'TEST_WF câu hỏi loa');   // re-render cleared step 0 input; refill
  await page.fill('#wf-1-topic', 'TEST_WF bước 2');
  const snapshots = [];
  await page.exposeFunction('__snap', t => snapshots.push(t));
  await page.evaluate(() => new MutationObserver(() => window.__snap(document.getElementById('wfResult').innerText.replace(/\s+/g, ' '))).observe(document.getElementById('wfResult'), { childList: true, subtree: true }));
  await page.click('#wfRunBtn');
  const finished = await page.waitForFunction(() => !document.getElementById('wfRunBtn').disabled && /Duyệt nội dung/.test(document.getElementById('wfResult').innerText), null, { timeout: 60000 }).then(() => true, () => false);
  const table = (await page.evaluate(() => document.getElementById('wfResult').innerText)).replace(/\s+/g, ' ');
  const newJobs = (await keys('aiJobs')).filter(k => !jobs0.includes(k)), newLogs = (await keys('aiLogs')).filter(k => !logs0.includes(k));
  const job = newJobs[0] ? await get('aiJobs/' + newJobs[0]) : null;
  const lg = newLogs[0] ? await get('aiLogs/' + newLogs[0]) : null;
  console.log('run finished:', finished);
  console.log('final table:', table.slice(0, 400));
  console.log('live render snapshots:', snapshots.length, '| had "Đang chờ" before end:', snapshots.some(s => /Đang chờ/.test(s)));
  console.log('aiJobs new:', newJobs.length, job ? JSON.stringify({ moduleId: job.moduleId, status: job.status, createdBy: job.createdBy, item: job.items && job.items[0] && { status: job.items[0].status, error: job.items[0].error, topic: job.items[0].inputParams && job.items[0].inputParams.topic } }) : '-');
  console.log('aiLogs new:', newLogs.length, lg ? JSON.stringify({ moduleId: lg.moduleId, status: lg.status, errorMessage: (lg.errorMessage || '').slice(0, 120) }) : '-');
  console.log('JS errors:', JSON.stringify(log.errors));
  // cleanup TEST job/log records created by this test
  for (const k of newJobs) await fetch('http://127.0.0.1:9000/aiJobs/' + k + '.json?ns=pshop-music-default-rtdb', { method: 'DELETE', ...H });
  for (const k of newLogs) await fetch('http://127.0.0.1:9000/aiLogs/' + k + '.json?ns=pshop-music-default-rtdb', { method: 'DELETE', ...H });
  await b.close();
})();
