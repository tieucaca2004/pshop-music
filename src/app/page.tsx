import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Truck, Headphones, BadgePercent } from "lucide-react";
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
      <section className="relative overflow-hidden border-b border-border bg-primary">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,theme(colors.accent/0.25),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              Đại lý thiết bị DJ &amp; âm thanh chính hãng
            </span>
            <h1 className="mt-4 font-heading text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Nâng tầm âm thanh của bạn với <span className="text-accent">Pshop Music</span>
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/70 sm:text-lg">
              Loa kiểm âm, bàn DJ, tai nghe và phụ kiện chính hãng — tư vấn tận tâm cho DJ,
              producer và phòng thu trên toàn quốc.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/danh-muc/ban-dj"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-6 py-3 font-semibold text-accent-foreground transition-colors duration-200 hover:bg-accent/90"
              >
                Khám phá sản phẩm
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/lien-he"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-white/10"
              >
                Liên hệ tư vấn
              </Link>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10">
            <Image
              src="https://picsum.photos/seed/dj-hero/900/700"
              alt="Thiết bị DJ Pshop Music"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4">
          {[
            { icon: ShieldCheck, label: "Hàng chính hãng 100%" },
            { icon: Truck, label: "Giao hàng toàn quốc" },
            { icon: Headphones, label: "Tư vấn chuyên sâu" },
            { icon: BadgePercent, label: "Giá tốt, hậu mãi tận tâm" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon className="shrink-0 text-accent" size={28} />
              <span className="text-sm font-semibold text-foreground/90">{label}</span>
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
        <div className="overflow-hidden rounded-2xl border border-border bg-primary px-6 py-10 text-center sm:px-12">
          <h2 className="font-heading text-2xl font-bold text-white sm:text-3xl">
            Cần tư vấn chọn thiết bị phù hợp?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">
            Đội ngũ Pshop Music sẵn sàng hỗ trợ bạn chọn bàn DJ, loa kiểm âm hoặc tai nghe phù hợp
            với nhu cầu và ngân sách.
          </p>
          <Link
            href="/lien-he"
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-6 py-3 font-semibold text-accent-foreground transition-colors duration-200 hover:bg-accent/90"
          >
            Liên hệ ngay
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
