import Link from "next/link";
import { Phone } from "lucide-react";
import { getCategories } from "@/lib/products";
import { MobileNav } from "@/components/mobile-nav";

export async function Header() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  try {
    categories = await getCategories();
  } catch {
    categories = [];
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="border-b border-border bg-primary/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 text-xs text-white/70 sm:text-sm">
          <span>Thiết bị DJ &amp; âm thanh chính hãng cho DJ, producer, phòng thu</span>
          <a
            href="tel:0901952999"
            className="hidden cursor-pointer items-center gap-1.5 font-semibold text-white hover:text-accent transition-colors duration-200 sm:flex"
          >
            <Phone size={14} />
            0901 952 999
          </a>
        </div>
      </div>

      <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent font-heading text-lg font-extrabold text-accent-foreground">
            P
          </span>
          <span className="font-heading text-xl font-bold tracking-tight">
            Pshop<span className="text-accent">Music</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/danh-muc/${cat.slug}`}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-foreground/90 hover:bg-card hover:text-accent transition-colors duration-200"
            >
              {cat.name}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 md:block">
          <Link
            href="/lien-he"
            className="cursor-pointer rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 transition-colors duration-200"
          >
            Liên hệ đặt hàng
          </Link>
        </div>

        <MobileNav categories={categories} />
      </div>
    </header>
  );
}
