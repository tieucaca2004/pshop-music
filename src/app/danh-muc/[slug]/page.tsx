import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryBySlug, getProducts } from "@/lib/products";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug).catch(() => null);
  if (!category) return {};
  return {
    title: category.name,
    description: `Mua ${category.name.toLowerCase()} chính hãng, giá tốt tại Pshop Music.`,
  };
}

export default async function CategoryPage({ params }: { params: Params }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug).catch(() => null);
  if (!category) notFound();

  const products = await getProducts({ categorySlug: slug }).catch(() => []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <nav className="text-sm text-muted-foreground">
        <Link href="/" className="cursor-pointer hover:text-accent transition-colors duration-200">Trang chủ</Link>
        <span className="px-2">/</span>
        <span className="text-foreground">{category.name}</span>
      </nav>
      <h1 className="mt-2 font-heading text-3xl font-bold">{category.name}</h1>
      <p className="mt-1 text-muted-foreground">{products.length} sản phẩm</p>

      {products.length > 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="mt-12 rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
          Hiện chưa có sản phẩm trong danh mục này.
        </div>
      )}
    </div>
  );
}
