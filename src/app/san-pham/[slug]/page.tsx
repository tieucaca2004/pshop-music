import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/products";
import { formatVND } from "@/lib/format";
import { ProductGallery } from "@/components/product-gallery";
import { ContactOrderForm } from "@/components/contact-order-form";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug).catch(() => null);
  if (!product) return {};
  return {
    title: product.name,
    description: product.short_desc ?? product.name,
    openGraph: {
      images: product.images?.[0]?.url ? [product.images[0].url] : [],
    },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug).catch(() => null);
  if (!product) notFound();

  const onSale = product.compare_price && Number(product.compare_price) > Number(product.price);
  const specRows = (product.specs ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [label, ...rest] = s.split(":");
      return { label: label?.trim(), value: rest.join(":").trim() };
    });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <nav className="text-sm text-muted-foreground">
        <Link href="/" className="cursor-pointer hover:text-accent transition-colors duration-200">Trang chủ</Link>
        <span className="px-2">/</span>
        {product.category_slug && (
          <>
            <Link
              href={`/danh-muc/${product.category_slug}`}
              className="cursor-pointer hover:text-accent transition-colors duration-200"
            >
              {product.category_name}
            </Link>
            <span className="px-2">/</span>
          </>
        )}
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <ProductGallery images={product.images ?? []} name={product.name} />

        <div>
          {product.brand && (
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">{product.brand}</p>
          )}
          <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">{product.name}</h1>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-2xl font-bold text-foreground">{formatVND(product.price)}</span>
            {onSale && (
              <span className="text-base text-muted-foreground line-through">
                {formatVND(product.compare_price!)}
              </span>
            )}
          </div>

          <p className="mt-2 text-sm">
            {product.in_stock ? (
              <span className="font-medium text-accent">Còn hàng</span>
            ) : (
              <span className="font-medium text-destructive">Hết hàng</span>
            )}
          </p>

          {product.short_desc && (
            <p className="mt-4 leading-relaxed text-muted-foreground">{product.short_desc}</p>
          )}

          {specRows.length > 0 && (
            <dl className="mt-6 divide-y divide-border rounded-xl border border-border">
              {specRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-right font-medium text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-8 rounded-xl border border-border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Đặt hàng / Tư vấn sản phẩm này</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Để lại thông tin, Pshop Music sẽ gọi xác nhận đơn hàng và tư vấn chi tiết.
            </p>
            <div className="mt-4">
              <ContactOrderForm productId={product.id} productName={product.name} />
            </div>
          </div>
        </div>
      </div>

      {product.description && (
        <section className="mt-12 max-w-3xl">
          <h2 className="font-heading text-xl font-bold">Mô tả sản phẩm</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        </section>
      )}
    </div>
  );
}
