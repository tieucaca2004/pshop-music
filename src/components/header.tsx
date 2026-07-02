import Link from "next/link";
import { Phone } from "lucide-react";
import { getCategories } from "@/lib/products";
import { MobileNav } from "@/components/mobile-nav";

const BRANDS = [
  "Pioneer DJ", "AlphaTheta", "KRK", "Monkey Banana", "Sennheiser",
  "Adam Audio", "JBL", "Native Instruments", "Audient", "Technics",
  "Bose", "Denon DJ", "Numark", "Roland", "Focusrite",
];

export async function Header() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  try {
    categories = await getCategories();
  } catch {
    categories = [];
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      {/* Main nav */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4">
        {/* Logo */}
        <Link href="/" className="shrink-0">
          <span className="font-heading text-lg font-extrabold tracking-widest text-white">
            P<span className="text-accent">·</span>SHOP MUSIC
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/" className="text-xs font-bold uppercase tracking-widest text-white/70 transition-colors hover:text-accent">
            Trang chủ
          </Link>
          {categories.slice(0, 4).map((cat) => (
            <Link
              key={cat.id}
              href={`/danh-muc/${cat.slug}`}
              className="text-xs font-bold uppercase tracking-widest text-white/70 transition-colors hover:text-accent"
            >
              {cat.name}
            </Link>
          ))}
          <Link href="/lien-he" className="text-xs font-bold uppercase tracking-widest text-white/70 transition-colors hover:text-accent">
            Liên hệ
          </Link>
        </nav>

        {/* CTA */}
        <div className="hidden shrink-0 items-center gap-4 md:flex">
          <a href="tel:0901952999" className="flex items-center gap-2 text-xs text-white/60 transition-colors hover:text-accent">
            <Phone size={13} />
            0901 952 999
          </a>
          <Link href="/lien-he" className="btn-gold">
            Tư vấn ngay
          </Link>
        </div>

        <MobileNav categories={categories} />
      </div>

      {/* Brand bar */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl overflow-x-auto px-4 py-2.5">
          <div className="flex items-center gap-8 whitespace-nowrap">
            {BRANDS.map((brand) => (
              <span
                key={brand}
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 transition-colors hover:text-white/60 cursor-default"
              >
                {brand}
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
