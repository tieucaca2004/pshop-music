import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Truck, Headphones, BadgePercent } from "lucide-react";
// Image kept for category cards below
import { getCategories, getProducts } from "@/lib/products";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

const categoryCopy: Record<string, { desc: string; image: string }> = {
  "loa-kiem-am": {
    desc: "Đáp ứng tần số chính xác cho phòng thu và mix nhạc",
    image: "https://picsum.photos/seed/cat-monitor/600/600",
  },
  "ban-dj": {
    desc: "Controller, mixer cho DJ chuyên nghiệp và người mới bắt đầu",
    image: "https://picsum.photos/seed/cat-dj/600/600",
  },
  "tai-nghe": {
    desc: "Cách âm tốt, chi tiết rõ ràng cho DJ booth và studio",
    image: "https://picsum.photos/seed/cat-headphone/600/600",
  },
  "phu-kien": {
    desc: "Chân đế, dây cáp, tiêu âm và phụ kiện đi kèm",
    image: "https://picsum.photos/seed/cat-acc/600/600",
  },
};

export default async function Home() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  let featured: Awaited<ReturnType<typeof getProducts>> = [];

  try {
    [categories, featured] = await Promise.all([
      getCategories(),
      getProducts({ featured: true, limit: 8 }),
    ]);
  } catch {
    categories = [];
    featured = [];
  }

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border bg-dot-grid scanlines">
        {/* Ambient light blobs */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-accent/10 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-[color:var(--color-neon)]/8 blur-[100px]" />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:py-28 lg:py-32">
          <div className="flex flex-col items-center text-center">
            {/* Badge */}
            <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-neon)]/30 bg-[color:var(--color-neon)]/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-neon)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-neon)]" />
              Đại lý thiết bị DJ &amp; âm thanh chính hãng
            </span>

            {/* Heading */}
            <h1 className="mt-6 font-heading text-5xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
              GEAR UP.{" "}
              <span className="text-accent text-glow-accent">DROP THE BEAT.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">
              Loa kiểm âm, bàn DJ, tai nghe và phụ kiện chính hãng — tư vấn tận tâm cho DJ,
              producer và phòng thu trên toàn quốc.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/danh-muc/ban-dj"
                className="glow-accent inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-7 py-3.5 font-bold text-white transition-all duration-200 hover:bg-accent/90 hover:scale-105"
              >
                Khám phá sản phẩm
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/lien-he"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-7 py-3.5 font-semibold text-white transition-all duration-200 hover:border-white/40 hover:bg-white/5"
              >
                Liên hệ tư vấn
              </Link>
            </div>

            {/* Animated equalizer */}
            <div className="mt-14 flex items-end gap-1.5">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className={`eq-bar w-2 ${
                    i % 3 === 0
                      ? "bg-accent"
                      : i % 3 === 1
                      ? "bg-[color:var(--color-neon)]/70"
                      : "bg-white/20"
                  }`}
                  style={{
                    height: "20px",
                    animationDelay: `${(i * 0.07).toFixed(2)}s`,
                    animationDuration: `${0.7 + (i % 5) * 0.1}s`,
                    animationName: `eq${(i % 8) + 1}`,
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/30">
              Pshop Music — Nha Trang
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/60">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-0 sm:grid-cols-4">
          {[
            { icon: ShieldCheck, label: "Hàng chính hãng 100%", color: "text-accent" },
            { icon: Truck, label: "Giao hàng toàn quốc", color: "text-[color:var(--color-neon)]" },
            { icon: Headphones, label: "Tư vấn chuyên sâu", color: "text-accent" },
            { icon: BadgePercent, label: "Giá tốt, hậu mãi tận tâm", color: "text-[color:var(--color-neon)]" },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex items-center gap-3 border-border px-6 py-5 [&:not(:last-child)]:border-r">
              <Icon className={`shrink-0 ${color}`} size={24} />
              <span className="text-sm font-semibold text-foreground/80">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="font-heading text-2xl font-bold sm:text-3xl">Danh mục sản phẩm</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/danh-muc/${cat.slug}`}
              className="group relative block cursor-pointer overflow-hidden rounded-xl border border-border"
            >
              <div className="relative aspect-square">
                <Image
                  src={categoryCopy[cat.slug]?.image ?? "https://picsum.photos/seed/cat-default/600/600"}
                  alt={cat.name}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-4">
                <h3 className="font-heading text-lg font-bold text-white">{cat.name}</h3>
                <p className="mt-1 text-xs text-white/70">{categoryCopy[cat.slug]?.desc}</p>
              </div>
            </Link>
          ))}
          {categories.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              Chưa kết nối được cơ sở dữ liệu sản phẩm. Vui lòng cấu hình DATABASE_URL.
            </p>
          )}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="border-t border-border bg-card/40">
          <div className="mx-auto max-w-7xl px-4 py-14">
            <div className="mb-8 flex items-end justify-between">
              <h2 className="font-heading text-2xl font-bold sm:text-3xl">Sản phẩm nổi bật</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-primary px-6 py-12 text-center sm:px-12">
          <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-accent/15 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[color:var(--color-neon)]/10 blur-[80px]" />
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[color:var(--color-neon)]">Tư vấn miễn phí</p>
            <h2 className="mt-3 font-heading text-3xl font-extrabold text-white sm:text-4xl">
              Chưa biết chọn thiết bị nào?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/60">
              Đội ngũ Pshop Music sẵn sàng hỗ trợ bạn chọn bàn DJ, loa kiểm âm hoặc tai nghe phù hợp
              với nhu cầu và ngân sách.
            </p>
            <Link
              href="/lien-he"
              className="glow-accent mt-7 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-8 py-3.5 font-bold text-white transition-all duration-200 hover:bg-accent/90 hover:scale-105"
            >
              Liên hệ ngay
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
