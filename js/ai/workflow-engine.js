/*
 * WorkflowEngine — Sprint 7 Requirement #4 (User-triggered Workflow
 * Automation). Cho phép Administrator ghép nhiều AI Plugin thành 1 chuỗi
 * Bước (Step) chạy TUẦN TỰ, CHỈ chạy khi Admin chủ động bấm "Chạy Workflow"
 * (admin/ai/workflow.html) — KHÔNG có Trigger tự động/Cron/Webhook nào ở
 * đây hay bất kỳ đâu khác.
 *
 * Đúng luồng bắt buộc: Administrator -> Run Workflow -> Step 1 (Plugin A ->
 * Queue -> Completed) -> Step 2 (Plugin B -> Queue -> Completed) -> ... ->
 * Step N -> Draft -> Human Review. Workflow BẮT BUỘC đi qua đúng 3 Layer đã
 * có — KHÔNG bypass: Permission Service (PermissionService.
 * checkPluginExecution(), gọi TRƯỚC mỗi bước, giống hệt cách js/admin-ai.js
 * runModule() đã làm cho 1 Plugin đơn — AI_RULES.md mục 8 đã dự liệu đúng
 * trường hợp này: "nếu có nơi khác gọi PluginManager.execute() trực tiếp,
 * nơi đó cũng phải tự gọi PermissionService.checkPluginExecution()"), Plugin
 * Manager (PluginManager.loadPlugin(id).execute() — KHÔNG tự gọi
 * AIJobQueue.enqueue()/AIModuleRegistry trực tiếp), Queue (AIJobQueue, QUEUE
 * DUY NHẤT đã có — mỗi Step vẫn tạo 1 Job riêng qua execute(), Workflow
 * không tạo Queue thứ 2, không tự chạy AI Provider).
 *
 * Định nghĩa Workflow (danh sách Step) chỉ tồn tại trong bộ nhớ trình duyệt
 * ở phiên chạy hiện tại (KHÔNG lưu vào Firebase) — KHÔNG đổi Database
 * Structure, đúng Architectural Constraint. Muốn lưu Workflow để tái sử
 * dụng nhiều lần cần 1 Collection mới, LÀ 1 thay đổi Database Structure —
 * để lại cho Decision Record riêng nếu được giao sau này (xem ROADMAP.md).
 *
 * KHÔNG Publish tự động: Workflow chỉ chạy tới khi Job của từng Step
 * "completed" (tạo Draft, trạng thái "draft") — không gọi publishToTarget()/
 * publishDraftById() ở bất kỳ đâu trong file này; Human Review vẫn là bước
 * thủ công của Admin tại admin/ai/drafts.html (không sửa).
 */
const WorkflowEngine = (function () {
  // runStep(step, userId, userEmail) -> Promise<StepResult>. Không bao giờ
  // reject — mọi lỗi (thiếu quyền/không tìm thấy plugin/plugin tắt/thiếu
  // field bắt buộc/job thất bại) đều được bắt và trả về qua StepResult.status
  // để run() tự quyết định dừng hay tiếp tục (Functional Requirement #5).
  function runStep(step, userId, userEmail) {
    return PermissionService.checkPluginExecution(userId, userEmail, step.pluginId).then(check => {
      if (!check.granted) {
        return {
          pluginId: step.pluginId, jobId: null, status: 'permission_denied',
          error: `Không có quyền chạy plugin này (thiếu "${check.permission || 'quyền chưa được gán'}").`
        };
      }

      return PluginManager.loadPlugin(step.pluginId).then(plugin => {
        if (!plugin) {
          return { pluginId: step.pluginId, jobId: null, status: 'plugin_not_found', error: 'Không tìm thấy plugin.' };
        }

        // Mỗi Step CHỈ chạy đúng 1 item (khớp semantics "Step 1 -> Step 2 ->
        // ... -> Step N" tuần tự của Workflow, không phải batch hàng loạt
        // như Dashboard đơn plugin) — vẫn gọi execute() -> enqueue() ->
        // resume() y hệt runModule() (js/admin-ai.js), Workflow không tự
        // viết logic Queue/không tự gọi AIJobQueue.enqueue() trực tiếp.
        return plugin.execute([step.inputParams], userId, userEmail)
          .then(job => AIJobQueue.resume(userId, userEmail).then(() => JobDB.get(job.id)).then(finalJob => {
            const status = finalJob ? finalJob.status : 'unknown';
            const failedItem = finalJob && Array.isArray(finalJob.items) ? finalJob.items.find(i => i.status === 'failed') : null;
            return {
              pluginId: step.pluginId,
              jobId: job.id,
              status,
              error: status === 'completed' ? null : ((failedItem && failedItem.error) || 'Job không hoàn tất.')
            };
          }))
          .catch(err => ({ pluginId: step.pluginId, jobId: null, status: 'failed', error: err.message }));
      });
    });
  }

  // run(steps, userId, userEmail, onStepDone) -> Promise<{ results, stoppedEarly }>.
  // Chạy tuần tự Step 1..N — dừng NGAY khi 1 Step không "completed" (Functional
  // Requirement #5 "Workflow dừng, không chạy bước tiếp theo"), không Publish
  // gì ở đây (Functional Requirement #7). onStepDone(result) (optional) được
  // gọi ngay sau mỗi Step để UI cập nhật tiến trình real-time.
  function run(steps, userId, userEmail, onStepDone) {
    const results = [];
    let stopped = false;

    return (steps || []).reduce((chain, step, index) => {
      return chain.then(() => {
        if (stopped) return;
        return runStep(step, userId, userEmail).then(result => {
          const entry = Object.assign({ stepIndex: index }, result);
          results.push(entry);
          if (typeof onStepDone === 'function') onStepDone(entry);
          if (result.status !== 'completed') stopped = true;
        });
      });
    }, Promise.resolve()).then(() => ({ results, stoppedEarly: stopped }));
  }

  return { run };
})();
