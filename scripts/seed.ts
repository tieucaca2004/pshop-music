import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const categories = [
  { name: "Loa kiểm âm", slug: "loa-kiem-am" },
  { name: "Bàn DJ", slug: "ban-dj" },
  { name: "Tai nghe", slug: "tai-nghe" },
  { name: "Phụ kiện", slug: "phu-kien" },
];

const products: Array<{
  name: string;
  slug: string;
  brand: string;
  price: number;
  comparePrice?: number;
  shortDesc: string;
  description: string;
  specs: string;
  featured?: boolean;
  category: string;
  images: string[];
}> = [
  {
    name: "Loa kiểm âm KRK Rokit 5 G4",
    slug: "loa-kiem-am-krk-rokit-5-g4",
    brand: "KRK",
    price: 6990000,
    comparePrice: 7990000,
    shortDesc: "Loa kiểm âm 5 inch, driver woofer KEVLAR, đáp ứng tần số chính xác cho phòng thu.",
    description:
      "KRK Rokit 5 G4 là dòng loa kiểm âm phổ biến nhất trong giới sản xuất nhạc, mang lại âm thanh trung thực với dải bass mạnh và treble rõ ràng. Phù hợp cho phòng thu home studio, mix/master và DJ booth.",
    specs: "Driver: 5\" Kevlar woofer + 1\" tweeter | Công suất: 55W | Tần số: 43Hz-40kHz | Kết nối: XLR, TRS, RCA",
    featured: true,
    category: "loa-kiem-am",
    images: ["https://picsum.photos/seed/krk-rokit5/800/800", "https://picsum.photos/seed/krk-rokit5-2/800/800"],
  },
  {
    name: "Loa kiểm âm Yamaha HS8",
    slug: "loa-kiem-am-yamaha-hs8",
    brand: "Yamaha",
    price: 12500000,
    shortDesc: "Loa kiểm âm 8 inch huyền thoại của Yamaha, chuẩn mực cho phòng thu chuyên nghiệp.",
    description:
      "Yamaha HS8 nổi tiếng với khả năng tái tạo âm thanh phẳng (flat response), giúp kỹ thuật viên mix chính xác hơn. Thiết kế bass-reflex, vỏ MDF chống cộng hưởng.",
    specs: "Driver: 8\" woofer + 1\" dome tweeter | Công suất: 75W (LF) + 45W (HF) | Tần số: 38Hz-30kHz",
    featured: true,
    category: "loa-kiem-am",
    images: ["https://picsum.photos/seed/yamaha-hs8/800/800"],
  },
  {
    name: "Loa kiểm âm JBL 305P MkII",
    slug: "loa-kiem-am-jbl-305p-mkii",
    brand: "JBL",
    price: 5490000,
    shortDesc: "Công nghệ JBL Image Control Waveguide, âm thanh cân bằng cho mọi vị trí ngồi nghe.",
    description:
      "JBL 305P MkII tích hợp công nghệ waveguide độc quyền giúp mở rộng vùng nghe tối ưu (sweet spot), phù hợp cho không gian thu âm nhỏ và vừa.",
    specs: "Driver: 5\" woofer + 1\" tweeter | Công suất: 82W | Tần số: 43Hz-24kHz",
    category: "loa-kiem-am",
    images: ["https://picsum.photos/seed/jbl-305p/800/800"],
  },
  {
    name: "Bàn DJ Pioneer DDJ-FLX4",
    slug: "ban-dj-pioneer-ddj-flx4",
    brand: "Pioneer DJ",
    price: 8990000,
    comparePrice: 9990000,
    shortDesc: "Bàn DJ controller 2 kênh, tương thích rekordbox & Serato, lý tưởng cho người mới bắt đầu.",
    description:
      "DDJ-FLX4 là lựa chọn hàng đầu cho DJ mới học, hỗ trợ chế độ Smart CFX và Smart Fade, dễ dàng hòa trộn bài hát mượt mà. Tương thích đa phần mềm DJ phổ biến.",
    specs: "2 kênh | Pad hiệu ứng 8 ô | Tương thích: rekordbox, Serato DJ Lite | Kết nối: USB-C",
    featured: true,
    category: "ban-dj",
    images: ["https://picsum.photos/seed/ddj-flx4/800/800", "https://picsum.photos/seed/ddj-flx4-2/800/800"],
  },
  {
    name: "Bàn DJ Pioneer DDJ-1000",
    slug: "ban-dj-pioneer-ddj-1000",
    brand: "Pioneer DJ",
    price: 27900000,
    shortDesc: "Bàn DJ 4 kênh chuyên nghiệp, layout giống hệ CDJ-2000NXS2/DJM-900NXS2.",
    description:
      "DDJ-1000 mang lại trải nghiệm điều khiển sát với hệ thống club chuyên nghiệp, jog wheel lớn cảm ứng nhạy, hỗ trợ đầy đủ tính năng rekordbox dj.",
    specs: "4 kênh | Jog wheel cảm ứng | Màn hình hiển thị track | Kết nối: USB",
    featured: true,
    category: "ban-dj",
    images: ["https://picsum.photos/seed/ddj-1000/800/800"],
  },
  {
    name: "Bàn DJ Denon DJ Prime 4+",
    slug: "ban-dj-denon-prime-4-plus",
    brand: "Denon DJ",
    price: 45900000,
    shortDesc: "Bàn DJ standalone 4 kênh, màn hình cảm ứng 10 inch, không cần laptop.",
    description:
      "Prime 4+ cho phép DJ chơi nhạc hoàn toàn độc lập không cần máy tính, tích hợp Wi-Fi streaming, màn hình cảm ứng lớn và engine xử lý mạnh mẽ.",
    specs: "4 kênh | Màn hình 10\" cảm ứng | Streaming: Tidal, SoundCloud | Lưu trữ: SSD/SD/USB",
    category: "ban-dj",
    images: ["https://picsum.photos/seed/prime4plus/800/800"],
  },
  {
    name: "Tai nghe Pioneer HDJ-X10",
    slug: "tai-nghe-pioneer-hdj-x10",
    brand: "Pioneer DJ",
    price: 7290000,
    shortDesc: "Tai nghe DJ cao cấp, driver 50mm, cách âm tốt, gập xoay linh hoạt.",
    description:
      "HDJ-X10 được thiết kế cho DJ chuyên nghiệp với khả năng cách âm vượt trội, driver 50mm tái tạo bass sâu và treble chi tiết, đệm tai bằng da êm ái.",
    specs: "Driver: 50mm | Trở kháng: 36 Ohm | Độ nhạy: 104dB | Trọng lượng: 305g",
    featured: true,
    category: "tai-nghe",
    images: ["https://picsum.photos/seed/hdj-x10/800/800"],
  },
  {
    name: "Tai nghe Sennheiser HD 25",
    slug: "tai-nghe-sennheiser-hd25",
    brand: "Sennheiser",
    price: 3990000,
    shortDesc: "Tai nghe DJ kinh điển, nhỏ gọn, độ bền cao, tiêu chuẩn ngành broadcast.",
    description:
      "HD 25 là huyền thoại trong giới DJ và broadcast nhờ độ bền, khả năng cách âm tốt và âm thanh chi tiết dù thiết kế nhỏ gọn, dễ mang theo.",
    specs: "Driver: 38mm | Trở kháng: 70 Ohm | Trọng lượng: 140g",
    category: "tai-nghe",
    images: ["https://picsum.photos/seed/hd25/800/800"],
  },
  {
    name: "Tai nghe Audio-Technica ATH-M50x",
    slug: "tai-nghe-audio-technica-ath-m50x",
    brand: "Audio-Technica",
    price: 3290000,
    shortDesc: "Tai nghe studio đa dụng, phổ biến cho mix, master và nghe kiểm âm.",
    description:
      "ATH-M50x là tai nghe được giới sản xuất âm nhạc tin dùng nhờ âm thanh cân bằng, độ chính xác cao và độ bền tốt, có thể gập gọn để mang theo.",
    specs: "Driver: 45mm | Trở kháng: 38 Ohm | Cáp tháo rời 3 loại",
    category: "tai-nghe",
    images: ["https://picsum.photos/seed/athm50x/800/800"],
  },
  {
    name: "Mixer DJ Allen & Heath Xone:96",
    slug: "mixer-dj-allen-heath-xone96",
    brand: "Allen & Heath",
    price: 52000000,
    shortDesc: "Mixer analog 6 kênh cao cấp, bộ lọc filter huyền thoại của Xone series.",
    description:
      "Xone:96 được giới DJ underground và techno yêu thích nhờ chất âm analog ấm, mạch filter đặc trưng và độ bền cơ khí cao cấp.",
    specs: "6 kênh | Filter: Low/High Xone | Kết nối: USB soundcard tích hợp",
    category: "phu-kien",
    images: ["https://picsum.photos/seed/xone96/800/800"],
  },
  {
    name: "Chân đế loa kiểm âm Gravity SP 5212B",
    slug: "chan-de-loa-gravity-sp5212b",
    brand: "Gravity",
    price: 1690000,
    shortDesc: "Cặp chân đế loa kiểm âm điều chỉnh độ cao, chống rung, ổn định.",
    description:
      "Chân đế chắc chắn giúp đặt loa kiểm âm ở độ cao tai nghe lý tưởng, tăng độ chính xác khi mix, tích hợp đệm chống rung.",
    specs: "Chiều cao: 80-140cm | Tải trọng: 20kg/chân | Vật liệu: hợp kim nhôm",
    category: "phu-kien",
    images: ["https://picsum.photos/seed/gravity-stand/800/800"],
  },
  {
    name: "Bộ đệm cách âm Auralex Studiofoam",
    slug: "bo-dem-cach-am-auralex-studiofoam",
    brand: "Auralex",
    price: 2290000,
    shortDesc: "Bộ tiêu âm phòng thu, giảm phản xạ âm, cải thiện chất lượng kiểm âm.",
    description:
      "Bộ foam tiêu âm giúp giảm hiện tượng phản xạ và cộng hưởng trong phòng, mang lại môi trường nghe chính xác hơn khi sử dụng loa kiểm âm.",
    specs: "Bộ 12 miếng | Kích thước: 30x30x5cm/miếng | Vật liệu: foam mật độ cao",
    category: "phu-kien",
    images: ["https://picsum.photos/seed/auralex-foam/800/800"],
  },
];

async function main() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL chưa được thiết lập trong .env");
  }

  const parsed = new URL(rawUrl);
  const sslMode = parsed.searchParams.get("ssl-mode");
  parsed.searchParams.delete("ssl-mode");

  const conn = await mysql.createConnection({
    uri: parsed.toString(),
    ssl: sslMode && sslMode.toUpperCase() !== "DISABLED" ? { rejectUnauthorized: false } : undefined,
  });

  console.log("Seeding categories...");
  const categoryIds = new Map<string, number>();
  for (const cat of categories) {
    await conn.execute(
      "INSERT INTO categories (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
      [cat.name, cat.slug]
    );
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM categories WHERE slug = ?",
      [cat.slug]
    );
    categoryIds.set(cat.slug, (rows[0] as { id: number }).id);
  }

  console.log("Seeding products...");
  for (const p of products) {
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) {
      throw new Error(`Không tìm thấy danh mục cho slug "${p.category}"`);
    }
    await conn.execute(
      `INSERT INTO products (name, slug, brand, price, compare_price, short_desc, description, specs, featured, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price), short_desc = VALUES(short_desc)`,
      [
        p.name,
        p.slug,
        p.brand,
        p.price,
        p.comparePrice ?? null,
        p.shortDesc,
        p.description,
        p.specs,
        p.featured ? 1 : 0,
        categoryId,
      ]
    );
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM products WHERE slug = ?",
      [p.slug]
    );
    const productId = (rows[0] as { id: number }).id;

    await conn.execute("DELETE FROM product_images WHERE product_id = ?", [productId]);
    for (let i = 0; i < p.images.length; i++) {
      await conn.execute(
        "INSERT INTO product_images (url, alt, position, product_id) VALUES (?, ?, ?, ?)",
        [p.images[i], p.name, i, productId]
      );
    }
  }

  console.log("Seeding admin user...");
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@pshopmusic.vn";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123456";
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await conn.execute(
    `INSERT INTO admin_users (email, password_hash, name) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [adminEmail, passwordHash, "Quản trị viên"]
  );
  console.log(`Admin account: ${adminEmail} / ${adminPassword} (đổi mật khẩu ngay sau khi đăng nhập lần đầu)`);

  await conn.end();
  console.log("Seed hoàn tất.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
