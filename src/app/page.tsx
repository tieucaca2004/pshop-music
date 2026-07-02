import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Truck, Headphones, BadgePercent } from "lucide-react";
import { getCategories, getProducts } from "@/lib/products";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

const categoryMeta: Record<string, { desc: string; image: string }> = {
  "loa-kiem-am": {
    desc: "Studio monitors cho phòng thu & mix",
    image: "https://picsum.photos/seed/cat-monitor/600/600",
  },
  "ban-dj": {
    desc: "Controller & mixer cho DJ chuyên nghiệp",
    image: "https://picsum.photos/seed/cat-dj/600/600",
  },
  "tai-nghe": {
    desc: "Tai nghe DJ & studio cách âm chuyên sâu",
    image: "https://picsum.photos/seed/cat-headphone/600/600",
  },
  "phu-kien": {
    desc: "Chân đế, cáp, tiêu âm và phụ kiện",
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
      <section className="relative overflow-hidden border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:py-32 lg:py-40">
          <p className="label-gold">Thiết bị DJ &amp; Âm thanh chính hãng</p>
          <h1 className="mt-4 max-w-3xl font-heading text-5xl font-extrabold uppercase leading-none tracking-tight text-white sm:text-6xl lg:text-7xl">
            Đầy đủ thiết bị<br />
            <span className="text-accent">DJ &amp; Âm thanh</span>
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/50">
            Hàng chính hãng, mới và qua sử dụng, bảo hành rõ ràng.<br />
            Giao hàng toàn quốc.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/danh-muc/ban-dj" className="btn-gold-filled">
              Xem sản phẩm <ArrowRight size={14} />
            </Link>
            <Link href="/lien-he" className="btn-gold">
              Tư vấn miễn phí
            </Link>
          </div>
        </div>

        {/* Decorative line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
      </section>

      {/* Trust bar */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 sm:grid-cols-4">
          {[
            { icon: ShieldCheck, label: "Hàng chính hãng 100%" },
            { icon: Truck, label: "Giao hàng toàn quốc" },
            { icon: Headphones, label: "Tư vấn chuyên sâu" },
            { icon: BadgePercent, label: "Giá tốt, hậu mãi tận tâm" },
          ].map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className={`flex items-center gap-3 px-6 py-5 ${i < 3 ? "border-r border-border" : ""}`}
            >
              <Icon className="shrink-0 text-accent" size={18} />
              <span className="text-xs font-bold uppercase tracking-wide text-white/60">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <p className="label-gold">Danh mục sản phẩm</p>
        <h2 className="mt-2 font-heading text-3xl font-extrabold uppercase tracking-tight text-white sm:text-4xl">
          Đầy đủ thiết bị<br />DJ &amp; Âm thanh
        </h2>
        <div className="mt-10 grid gap-px sm:grid-cols-2 lg:grid-cols-4 bg-border">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/danh-muc/${cat.slug}`}
              className="group relative block aspect-[3/4] overflow-hidden bg-card"
            >
              <Image
                src={categoryMeta[cat.slug]?.image ?? "https://picsum.photos/seed/cat-default/600/600"}
                alt={cat.name}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover opacity-40 transition-all duration-500 group-hover:opacity-60 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <h3 className="font-heading text-xl font-extrabold uppercase tracking-wide text-white">
                  {cat.name}
                </h3>
                <p className="mt-1 text-xs text-white/50">{categoryMeta[cat.slug]?.desc}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-accent">
                  Xem ngay <ArrowRight size={10} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      {featured.length > 0 && (
        <section className="border-t border-border">
          <div className="mx-auto max-w-7xl px-4 py-16">
            <div className="flex items-end justify-between">
              <div>
                <p className="label-gold">Nổi bật</p>
                <h2 className="mt-1 font-heading text-3xl font-extrabold uppercase tracking-tight text-white">
                  Sản phẩm nổi bật
                </h2>
              </div>
              <Link href="/danh-muc/ban-dj" className="btn-gold hidden sm:inline-flex">
                Xem tất cả
              </Link>
            </div>
            <div className="mt-8 grid gap-px sm:grid-cols-2 lg:grid-cols-4 bg-border">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <p className="label-gold">Tư vấn miễn phí</p>
          <h2 className="mt-3 font-heading text-3xl font-extrabold uppercase tracking-tight text-white sm:text-4xl">
            Chưa biết chọn thiết bị nào?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/50">
            Đội ngũ Pshop Music sẵn sàng hỗ trợ bạn chọn bàn DJ, loa kiểm âm hoặc tai nghe
            phù hợp với nhu cầu và ngân sách.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-4">
            <Link href="/lien-he" className="btn-gold-filled">
              Liên hệ ngay <ArrowRight size={14} />
            </Link>
            <a href="tel:0901952999" className="btn-gold">
              0901 952 999
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
