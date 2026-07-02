import Link from "next/link";
import { Phone, Mail, MapPin, ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="inline-block">
            <span className="font-heading text-lg font-extrabold tracking-widest text-white">
              P<span className="text-accent">·</span>SHOP MUSIC
            </span>
          </Link>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Chuyên cung cấp thiết bị DJ, loa kiểm âm, tai nghe và phụ kiện âm thanh chính hãng
            cho DJ và producer Việt Nam.
          </p>
        </div>

        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Danh mục</h3>
          <ul className="mt-4 space-y-2.5">
            {[
              { href: "/danh-muc/loa-kiem-am", label: "Loa kiểm âm" },
              { href: "/danh-muc/ban-dj", label: "Bàn DJ" },
              { href: "/danh-muc/tai-nghe", label: "Tai nghe" },
              { href: "/danh-muc/phu-kien", label: "Phụ kiện" },
            ].map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="text-xs text-muted-foreground transition-colors hover:text-accent">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Hỗ trợ</h3>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link href="/lien-he" className="text-xs text-muted-foreground transition-colors hover:text-accent">
                Liên hệ đặt hàng
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Liên hệ</h3>
          <ul className="mt-4 space-y-3">
            <li className="flex items-center gap-2.5">
              <Phone size={13} className="shrink-0 text-accent" />
              <a href="tel:0901952999" className="text-xs text-muted-foreground transition-colors hover:text-accent">
                0901 952 999
              </a>
            </li>
            <li className="flex items-center gap-2.5">
              <Mail size={13} className="shrink-0 text-accent" />
              <a href="mailto:hello@pshopmusic.vn" className="text-xs text-muted-foreground transition-colors hover:text-accent">
                hello@pshopmusic.vn
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin size={13} className="mt-0.5 shrink-0 text-accent" />
              <span className="text-xs text-muted-foreground">86 Lạc Long Quân, Phường Phước Hải, Nha Trang</span>
            </li>
            <li className="flex items-center gap-2.5">
              <ExternalLink size={13} className="shrink-0 text-accent" />
              <a
                href="https://www.facebook.com/ChoThueThietBiDJ/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground transition-colors hover:text-accent"
              >
                Facebook fanpage
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border px-4 py-4 text-center">
        <span className="text-[10px] uppercase tracking-widest text-white/20">
          © {new Date().getFullYear()} Pshop Music · All rights reserved
        </span>
      </div>
    </footer>
  );
}
