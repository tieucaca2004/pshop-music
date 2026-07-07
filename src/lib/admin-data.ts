import { query } from "@/lib/db";
import type { Category, ContactOrder, Product, ProductImage } from "@/types";

export async function getAdminStats() {
  const [[productCount], [categoryCount], [newLeadCount]] = await Promise.all([
    query<{ count: number }[]>("SELECT COUNT(*) AS count FROM products"),
    query<{ count: number }[]>("SELECT COUNT(*) AS count FROM categories"),
    query<{ count: number }[]>("SELECT COUNT(*) AS count FROM contact_orders WHERE status = 'new'"),
  ]);
  return {
    products: productCount?.count ?? 0,
    categories: categoryCount?.count ?? 0,
    newLeads: newLeadCount?.count ?? 0,
  };
}

export async function getAllProductsAdmin(): Promise<Product[]> {
  return query<Product[]>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p
     JOIN categories c ON c.id = p.category_id
     ORDER BY p.created_at DESC`
  );
}

export async function getProductByIdAdmin(id: number): Promise<Product | null> {
  const rows = await query<Product[]>("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
  const product = rows[0];
  if (!product) return null;
  const images = await query<ProductImage[]>(
    "SELECT * FROM product_images WHERE product_id = ? ORDER BY position ASC",
    [id]
  );
  return { ...product, images };
}

export async function getMediaLibrary(): Promise<string[]> {
  const rows = await query<{ url: string }[]>(
    `SELECT url, MAX(id) AS last_id FROM product_images GROUP BY url ORDER BY last_id DESC LIMIT 60`
  );
  return rows.map((r) => r.url);
}

export async function getAllCategoriesAdmin(): Promise<Category[]> {
  return query<Category[]>("SELECT * FROM categories ORDER BY position ASC, id ASC");
}

export async function getAllLeadsAdmin(): Promise<ContactOrder[]> {
  return query<ContactOrder[]>(
    `SELECT co.*, p.name AS product_name
     FROM contact_orders co
     LEFT JOIN products p ON p.id = co.product_id
     ORDER BY co.created_at DESC`
  );
}

/** Read-only counts for the admin Dashboard cards (Sprint 8, Requirement #5). */
export async function getDashboardOverview() {
  const [[productRow], [categoryRow], [leadRow], [mediaRow]] = await Promise.all([
    query<{ total: number; in_stock: number }[]>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN in_stock = 1 THEN 1 ELSE 0 END) AS in_stock FROM products`
    ),
    query<{ total: number }[]>("SELECT COUNT(*) AS total FROM categories"),
    query<{ total: number; new_count: number }[]>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count FROM contact_orders`
    ),
    query<{ count: number }[]>("SELECT COUNT(DISTINCT url) AS count FROM product_images"),
  ]);

  return {
    productsTotal: productRow?.total ?? 0,
    productsInStock: Number(productRow?.in_stock ?? 0),
    categoriesTotal: categoryRow?.total ?? 0,
    leadsTotal: leadRow?.total ?? 0,
    leadsNew: Number(leadRow?.new_count ?? 0),
    mediaTotal: mediaRow?.count ?? 0,
  };
}

/** Recent Activity: products edited most recently (Sprint 8, Requirement #5). */
export async function getRecentlyUpdatedProducts(
  limit = 5
): Promise<{ id: number; name: string; updated_at: string }[]> {
  return query<{ id: number; name: string; updated_at: string }[]>(
    "SELECT id, name, updated_at FROM products ORDER BY updated_at DESC LIMIT ?",
    [limit]
  );
}

/** System Status "Database" check — read-only, no mutation (Sprint 8, Requirement #5). */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
