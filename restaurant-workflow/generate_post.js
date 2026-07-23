const fs = require('fs');
const path = require('path');
const menu = require('./menu.json');
const state = require('./state.json');

const TONE_OPENERS = [
  'Bạn có biết tô hủ tiếu xào thơm phức trước mặt chứa bao nhiêu dinh dưỡng không?',
  'Ăn ngon mà vẫn chuẩn dinh dưỡng — đó là tiêu chí của Á Tiểu Nhị!',
  'Nhìn hấp dẫn vậy thôi, nhưng món này còn bất ngờ hơn khi biết giá trị dinh dưỡng đấy!',
  'Mỗi tô hủ tiếu xào không chỉ là chuyện no bụng — nó là cả một bảng dinh dưỡng cân bằng.',
  'Hôm nay Á Tiểu Nhị sẽ "mổ xẻ" dinh dưỡng của một món trong menu nhé!'
];

const TONE_CLOSERS = [
  'Còn chần chờ gì nữa? Ghé Á Tiểu Nhị ngay để thưởng thức trực tiếp!',
  'Đừng chỉ đọc — hãy đến và cảm nhận từng sợi hủ tiếu tại Á Tiểu Nhị bạn nhé!',
  'Á Tiểu Nhị — nơi món ngon gặp gỡ dinh dưỡng chuẩn khoa học.',
  'Vừa ngon, vừa bổ — chỉ có tại Hủ Tiếu Xào Á Tiểu Nhị!',
  'Món nào cũng ngon, ngày nào cũng nấu — Á Tiểu Nhị chờ bạn!'
];

function getPostDish() {
  const total = menu.menuItems.length;
  let idx = state.nextIndex;
  if (idx >= total) idx = 0;
  const dish = menu.menuItems[idx];
  state.lastPostId = dish.id;
  state.lastPostDate = new Date().toISOString();
  state.postedItems.push({
    id: dish.id,
    date: state.lastPostDate
  });
  state.nextIndex = (idx + 1) % total;
  fs.writeFileSync(path.join(__dirname, 'state.json'), JSON.stringify(state, null, 2));
  return dish;
}

function generateContent(dish) {
  const opener = TONE_OPENERS[Math.floor(Math.random() * TONE_OPENERS.length)];
  const closer = TONE_CLOSERS[Math.floor(Math.random() * TONE_CLOSERS.length)];
  
  const hasVeg = dish.fiber_g >= 3.5;
  const isLowCal = dish.calories <= 400;
  const isHighProtein = dish.protein_g >= 28;

  let nutritionBody = '';
  nutritionBody += `Món **${dish.name}** của Á Tiểu Nhị chứa khoảng **${dish.calories} calo** trong mỗi phần ăn, với **${dish.protein_g}g đạm**, **${dish.carbs_g}g carbohydrate**, **${dish.fat_g}g chất béo** và **${dish.fiber_g}g chất xơ**.  \n\n`;

  nutritionBody += `Điểm đặc biệt của món này là thành phần chính **${dish.mainIngredient}**. `;
  nutritionBody += dish.highlight_1 + '. ';
  nutritionBody += dish.highlight_2 + '. ';
  nutritionBody += dish.highlight_3 + '.  \n\n';

  if (isHighProtein) {
    nutritionBody += `🍗 Với tới **${dish.protein_g}g đạm**, món này xứng đáng là "siêu thực phẩm" cho những ai cần xây dựng cơ bắp và phục hồi cơ thể sau vận động. Đạm từ ${dish.mainIngredient} là nguồn protein hoàn chỉnh, chứa đầy đủ các axit amin thiết yếu.  \n\n`;
  }

  if (isLowCal) {
    nutritionBody += `🥬 Chỉ **${dish.calories} calo** — món này là lựa chọn thông minh cho những bạn đang kiểm soát cân nặng. Ăn no mà không lo tăng cân, lại còn đủ dinh dưỡng.  \n\n`;
  }

  if (hasVeg) {
    nutritionBody += `🥦 Lượng chất xơ ${dish.fiber_g}g giúp bạn no lâu hơn, hỗ trợ hệ tiêu hóa khỏe mạnh và ổn định đường huyết. Đây là lý do món này không chỉ ngon mà còn rất "lành" cho cơ thể.  \n\n`;
  }

  nutritionBody += `**Bảng dinh dưỡng tóm tắt:**  \n`;
  nutritionBody += `🔹 Calories: ${dish.calories} kcal  \n`;
  nutritionBody += `🔹 Protein: ${dish.protein_g}g  \n`;
  nutritionBody += `🔹 Carbs: ${dish.carbs_g}g  \n`;
  nutritionBody += `🔹 Chất béo: ${dish.fat_g}g  \n`;
  nutritionBody += `🔹 Chất xơ: ${dish.fiber_g}g  \n\n`;

  let hasV = '';
  const vits = [];
  if (dish.mainIngredient.includes('bò')) vits.push('Vitamin B12, Sắt, Kẽm');
  if (dish.mainIngredient.includes('tôm') || dish.mainIngredient.includes('hải sản')) vits.push('Omega-3, Selen, I-ốt');
  if (dish.mainIngredient.includes('gà') || dish.mainIngredient.includes('nấm')) vits.push('Vitamin B6, Selen, Beta-glucan');
  if (dish.mainIngredient.includes('rau') || dish.mainIngredient.includes('củ') || dish.mainIngredient.includes('chay')) vits.push('Vitamin A, C, Chất xơ');
  if (dish.mainIngredient.includes('trứng')) vits.push('Lecithin, Vitamin D, Canxi');
  if (vits.length > 0) {
    hasV = `Ngoài ra, ${dish.name} còn cung cấp ${vits.join(', ')} — những vi chất quan trọng giúp cơ thể khỏe mạnh từ bên trong.  \n\n`;
  }

  const fullContent = `${opener}  \n\n`
    + `${nutritionBody}`
    + `${hasV}`
    + `📌 **${dish.name}** — chỉ có tại **Hủ Tiếu Xào Á Tiểu Nhị**  \n`
    + `${closer}`;

  return fullContent;
}

function getHashtags(dish) {
  const base = ['HuTieuXao', 'ATieuNhi', 'AmThucDuongPho', 'MonNgonSaiGon', 'DietThongMinh'];
  const tags = [...base];
  if (dish.mainIngredient.includes('bò')) tags.push('ThitBo', 'HuTieuXaoBo');
  if (dish.mainIngredient.includes('tôm')) tags.push('TomTuoi', 'HaiSan');
  if (dish.mainIngredient.includes('gà')) tags.push('ThitGa');
  if (dish.mainIngredient.includes('hải sản') || dish.mainIngredient.includes('mực')) tags.push('HaiSanTuoi');
  if (dish.mainIngredient.includes('chay') || dish.mainIngredient.includes('rau')) tags.push('AmThucChay');
  if (dish.calories <= 400) tags.push('AnKieng');
  if (dish.protein_g >= 28) tags.push('NhieuDam', 'Sickhoe');
  tags.push('GiaTriDinhDuong', 'AnNgonKhoeManh');
  return [...new Set(tags)];
}

// Main
const dish = getPostDish();
const content = generateContent(dish);
const hashtags = getHashtags(dish);
const imagePrompt = `Professional food photography of a plate of Vietnamese ${dish.name}, garnished with fresh herbs, scallions, and sesame seeds, on a ceramic plate with chopsticks, warm ambient lighting, rustic wooden table, top-down angle, mouth-watering, hyper-realistic, 4K, food magazine quality`;

const output = {
  dish: dish.name,
  date: new Date().toISOString(),
  content: content + '\n\n' + hashtags.map(t => '#' + t).join(' '),
  imagePrompt: imagePrompt,
  hashtags: hashtags
};

fs.writeFileSync(path.join(__dirname, 'posts', `post_${dish.id}_${Date.now()}.json`), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
