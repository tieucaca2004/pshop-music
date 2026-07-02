import Link from "next/link";
import { Phone, Mail, MapPin, ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-heading text-base font-extrabold text-accent-foreground">
              P
            </span>
            <span className="font-heading text-lg font-bold">
              Pshop<span className="text-accent">Music</span>
            </span>
          </Link>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Chuyên cung cấp thiết bị DJ, loa kiểm âm, tai nghe và phụ kiện âm thanh chính hãng,
            giá tốt nhất cho DJ và producer Việt Nam.
          </p>
        </div>

        <div>
          <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">
            Danh mục
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/danh-muc/loa-kiem-am" className="cursor-pointer hover:text-accent transition-colors duration-200">Loa kiểm âm</Link></li>
            <li><Link href="/danh-muc/ban-dj" className="cursor-pointer hover:text-accent transition-colors duration-200">Bàn DJ</Link></li>
            <li><Link href="/danh-muc/tai-nghe" className="cursor-pointer hover:text-accent transition-colors duration-200">Tai nghe</Link></li>
            <li><Link href="/danh-muc/phu-kien" className="cursor-pointer hover:text-accent transition-colors duration-200">Phụ kiện</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">
            Hỗ trợ
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/lien-he" className="cursor-pointer hover:text-accent transition-colors duration-200">Liên hệ đặt hàng</Link></li>
            <li><Link href="/ve-chung-toi" className="cursor-pointer hover:text-accent transition-colors duration-200">Về Pshop Music</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">
            Liên hệ
          </h3>
          <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Phone size={16} className="text-accent shrink-0" />
              <a href="tel:0901952999" className="cursor-pointer hover:text-accent transition-colors duration-200">0901 952 999</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail size={16} className="text-accent shrink-0" />
              <a href="mailto:hello@pshopmusic.vn" className="cursor-pointer hover:text-accent transition-colors duration-200">hello@pshopmusic.vn</a>
            </li>
            <li className="flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 text-accent shrink-0" />
              <span>86 Lạc Long Quân, Phường Phước Hải, Nha Trang</span>
            </li>
            <li className="flex items-center gap-2">
              <ExternalLink size={16} className="text-accent shrink-0" />
              <a href="https://www.facebook.com/ChoThueThietBiDJ/" target="_blank" rel="noopener noreferrer" className="cursor-pointer hover:text-accent transition-colors duration-200">Facebook fanpage</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Pshop Music. All rights reserved.
      </div>
    </footer>
  );
}
