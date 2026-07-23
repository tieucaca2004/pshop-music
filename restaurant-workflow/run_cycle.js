const fs = require('fs');
const path = require('path');
const state = require('./state.json');

// Check if it's time for a new post
const lastPostDate = state.schedule.lastPostDate;
if (lastPostDate) {
  const last = new Date(lastPostDate);
  const now = new Date();
  const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  if (diffDays < state.schedule.cycleDays) {
    console.log(`⏳ Chưa đến ngày đăng. Còn ${state.schedule.cycleDays - diffDays} ngày nữa.`);
    process.exit(0);
  }
}

// Get current cycle info
const cycleIdx = state.schedule.currentCycleIndex;
const itemIdx = state.schedule.currentItemIndex;
const cycleType = state.schedule.cyclePattern[cycleIdx];

// Get the item to post about
let items;
if (cycleType === 'rau') items = state.rau_items;
else if (cycleType === 'thit') items = state.thit_items;
else items = state.mon_an_items;

if (itemIdx >= items.length) {
  // Reset item index for this type
  state.schedule.currentItemIndex = 0;
}

const item = items[state.schedule.currentItemIndex];

// For mon_an items - need ingredients from owner
if (cycleType === 'mon_an' && item.needIngredients) {
  console.log('❓ Cần hỏi StormT thành phần của món: ' + item.name);
  console.log('node src/make_post.js ' + item.id + ' "' + item.name + '"');
  process.exit(0);
}

// Generate the post content
console.log('📝 Đến lượt: [' + cycleType.toUpperCase() + '] ' + item.name);

// Advance state
state.schedule.currentItemIndex++;
if (state.schedule.currentItemIndex >= items.length) {
  state.schedule.currentItemIndex = 0;
  state.schedule.currentCycleIndex = (cycleIdx + 1) % 3;
}
state.schedule.lastPostDate = new Date().toISOString();
fs.writeFileSync(path.join(__dirname, 'state.json'), JSON.stringify(state, null, 2));

console.log('✅ Đã lưu trạng thái. Bài tiếp theo sau ' + state.schedule.cycleDays + ' ngày.');
console.log('');
console.log('=== Bài mẫu cho: ' + item.name + ' ===');
console.log('(Tạo content 500 từ + tìm ảnh Google)');
