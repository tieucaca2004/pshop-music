const restaurantInfo = require('../knowledge/restaurant-info.json');

const featuredList = restaurantInfo.featuredDishes.map(d => '• ' + d).join('\n');

const replies = {
  ask_menu: [
    'Cảm ơn bạn đã quan tâm! 🍜\n\nĐây là menu của **' + restaurantInfo.restaurant.name + '**:\n\n' + featuredList + '\n\nXem chi tiết menu tại: ' + restaurantInfo.menuLink + '\n\nGhé quán thưởng thức nha! 🔥',
    'Dạ, gửi bạn menu quán mình nè! 🥢\n\n' + featuredList + '\n\nNgoài ra còn nhiều món đặc biệt khác. Ghé **' + restaurantInfo.restaurant.name + '** để xem menu đầy đủ nhé! 📍' + restaurantInfo.restaurant.address
  ],
  ask_address: [
    'Địa chỉ quán mình nè bạn! 📍\n\n**' + restaurantInfo.restaurant.name + '**\n' + restaurantInfo.restaurant.address + '\n\nXem đường đi: ' + restaurantInfo.restaurant.googleMaps + '\n\nGhé chơi nha! 🚀',
    'Tụi mình ở đây nè! 🗺️\n\n' + restaurantInfo.restaurant.address + '\n\nGoogle Maps: ' + restaurantInfo.restaurant.googleMaps + '\n\nMở cửa ' + restaurantInfo.restaurant.openingHours.weekdays + ' (cả tuần). Hẹn gặp bạn! 😊'
  ],
  ask_hours: [
    'Giờ mở cửa của **' + restaurantInfo.restaurant.name + '** nè! 🕐\n\n• Thứ 2 - Thứ 6: ' + restaurantInfo.restaurant.openingHours.weekdays + '\n• Thứ 7 - Chủ nhật: ' + restaurantInfo.restaurant.openingHours.weekends + '\n\nTối ghé ăn nha! 🌙',
    'Quán mở cửa:\n\n• Ngày thường: ' + restaurantInfo.restaurant.openingHours.weekdays + '\n• Cuối tuần: ' + restaurantInfo.restaurant.openingHours.weekends + '\n\nChờ bạn đến ăn! 😊'
  ],
  ask_phone: [
    'Số điện thoại **' + restaurantInfo.restaurant.name + '**: 📞\n\n' + restaurantInfo.restaurant.phone + '\n\nLiên hệ đặt bàn hoặc gọi ship nha! 💪',
    'Bạn liên hệ quán qua số: ' + restaurantInfo.restaurant.phone + '\n\nNhấc máy lên gọi liền tụi mình nhé! 📱'
  ],
  ask_delivery: [
    'Có ship nha bạn! 🛵\n\nĐặt qua các app:\n• GrabFood: ' + restaurantInfo.restaurant.delivery.grabFood + '\n• ShopeeFood: ' + restaurantInfo.restaurant.delivery.shopeeFood + '\n• Baemin: ' + restaurantInfo.restaurant.delivery.baemin + '\n\nKhông ra khỏi nhà cũng được ăn hủ tiếu xào! 🔥',
    'Dạ, quán có giao hàng tận nơi qua: 🚚\n\n' + (restaurantInfo.restaurant.delivery.grabFood ? '• 🟢 GrabFood: ' + restaurantInfo.restaurant.delivery.grabFood + '\n' : '') + (restaurantInfo.restaurant.delivery.shopeeFood ? '• 🟠 ShopeeFood: ' + restaurantInfo.restaurant.delivery.shopeeFood + '\n' : '') + (restaurantInfo.restaurant.delivery.baemin ? '• 🔵 Baemin: ' + restaurantInfo.restaurant.delivery.baemin + '\n' : '') + '\nHoặc gọi trực tiếp ' + restaurantInfo.restaurant.phone + ' để đặt nha!'
  ],
  ask_price: [
    'Giá các món tại **' + restaurantInfo.restaurant.name + '** rất hợp lý! 💰\n\n• Hủ Tiếu Xào: 35k - 55k / tô (tuỳ topping)\n• Nước uống: 10k - 20k\n• Combo: 50k - 80k\n\nNgon - bổ - rẻ, ghé quán ăn thử nha! 😊',
    'Giá cả niêm yết, sinh viên cũng ăn được! 🎓\n\nHủ tiếu xào chỉ từ **35k** các bạn ơi! Ghé **' + restaurantInfo.restaurant.name + '** ăn thử nhé! 🔥'
  ],
  ask_promotion: [
    'Hiện tại **' + restaurantInfo.restaurant.name + '** đang có:\n\n🎉 Giảm 10% cho đơn đầu tiên trên GrabFood\n🎉 Tô thứ 2 giảm 50% vào Thứ 3 hàng tuần\n🎉 Combo 2 người chỉ 99k (11h-14h)\n\nNhanh chân kẻo hết nha bạn! 🔥',
    'Tin vui! 🎊\n\nQuán đang có khuyến mãi:\n• Giảm 10% đơn Ship qua app\n• Miễn phí trà đá khi ăn tại quán\n• Tích điểm đổi quà\n\nMời bạn ghé chơi! 💪'
  ],
  complaint: [
    'Cảm ơn bạn đã góp ý! 🙏\n\n**' + restaurantInfo.restaurant.name + '** xin lỗi vì trải nghiệm không tốt của bạn.\n\nChủ quán đã được thông báo và sẽ xem xét ngay. Bạn có thể liên hệ trực tiếp **' + restaurantInfo.restaurant.phone + '** để được hỗ trợ nhanh nhất ạ.\n\nChúng tôi luôn muốn cải thiện để phục vụ bạn tốt hơn! ❤️',
    'Xin lỗi bạn vì sự cố này! 😔\n\n**' + restaurantInfo.restaurant.name + '** rất trân trọng góp ý của bạn.\n\nAdmin đã nhận được phản hồi và sẽ xử lý sớm nhất. Bạn vui lòng inbox hoặc gọi ' + restaurantInfo.restaurant.phone + ' để tụi mình hỗ trợ nhanh hơn nhé! 🙇‍♂️'
  ],
  praise: [
    'Cảm ơn bạn nhiều! 🥰\n\n**' + restaurantInfo.restaurant.name + '** rất vui vì bạn yêu thích món ăn của tụi mình!\n\nNhớ ghé thường xuyên và giới thiệu bạn bè nha! 🔥\n\n📍 ' + restaurantInfo.restaurant.address,
    'Wow, cảm ơn bạn! 😍\n\nĐộng lực của **' + restaurantInfo.restaurant.name + '** là nụ cười của thực khách. Hẹn gặp lại bạn sớm nha! 🥢❤️'
  ],
  spam: [null]
};

function getReply(intent) {
  const intentReplies = replies[intent];
  if (!intentReplies) return null;
  const validReplies = intentReplies.filter(r => r !== null);
  if (validReplies.length === 0) return null;
  return validReplies[Math.floor(Math.random() * validReplies.length)];
}

function getAllReplies() {
  return replies;
}

function updateReply(intent, index, text) {
  if (!replies[intent]) return false;
  if (index < 0 || index >= replies[intent].length) return false;
  replies[intent][index] = text;
  return true;
}

function addReply(intent, text) {
  if (!replies[intent]) return false;
  replies[intent].push(text);
  return true;
}

module.exports = { getReply, getAllReplies, updateReply, addReply };
