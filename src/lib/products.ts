import { query } from "@/lib/db";
import type { Category, Product, ProductImage } from "@/types";

export async function getCategories(): Promise<Category[]> {
  return query<Category[]>(
    "SELECT id, name, slug, position FROM categories ORDER BY position ASC, id ASC"
  );
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const rows = await query<Category[]>(
    "SELECT id, name, slug, position FROM categories WHERE slug = ? LIMIT 1",
    [slug]
  );
  return rows[0] ?? null;
}

type ProductFilters = {
  categorySlug?: string;
  featured?: boolean;
  limit?: number;
};

export async function getProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.categorySlug) {
    conditions.push("c.slug = ?");
    params.push(filters.categorySlug);
  }
  if (filters.featured) {
    conditions.push("p.featured = 1");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ? `LIMIT ${Number(filters.limit)}` : "";

  const products = await query<Product[]>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p
     JOIN categories c ON c.id = p.category_id
     ${where}
     ORDER BY p.created_at DESC
     ${limit}`,
    params
  );

  if (products.length === 0) return [];

  const ids = products.map((p) => p.id);
  const images = await query<ProductImage[]>(
    `SELECT * FROM product_images WHERE product_id IN (${ids.map(() => "?").join(",")}) ORDER BY position ASC`,
    ids
  );

  return products.map((p) => ({
    ...p,
    images: images.filter((img) => img.product_id === p.id),
  }));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const rows = await query<Product[]>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.slug = ? LIMIT 1`,
    [slug]
  );
  const product = rows[0];
  if (!product) return null;

  const images = await query<ProductImage[]>(
    "SELECT * FROM product_images WHERE product_id = ? ORDER BY position ASC",
    [product.id]
  );

  return { ...product, images };
}
