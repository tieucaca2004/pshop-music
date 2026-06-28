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
