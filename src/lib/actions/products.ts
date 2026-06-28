"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { slugify } from "@/lib/slugify";

function parseImages(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createProduct(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const comparePrice = formData.get("comparePrice") ? Number(formData.get("comparePrice")) : null;
  const shortDesc = String(formData.get("shortDesc") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const specs = String(formData.get("specs") ?? "").trim();
  const categoryId = Number(formData.get("categoryId"));
  const featured = formData.get("featured") === "on" ? 1 : 0;
  const inStock = formData.get("inStock") === "on" ? 1 : 0;
  const images = parseImages(String(formData.get("images") ?? ""));

  if (!name || !categoryId || !price) {
    throw new Error("Thiếu thông tin bắt buộc.");
  }

  const slug = slugify(name) + "-" + Date.now().toString(36);

  const result = await query<{ insertId: number }>(
    `INSERT INTO products (name, slug, brand, price, compare_price, short_desc, description, specs, featured, in_stock, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, slug, brand || null, price, comparePrice, shortDesc || null, description || null, specs || null, featured, inStock, categoryId]
  );
  const productId = (result as unknown as { insertId: number }).insertId;

  for (let i = 0; i < images.length; i++) {
    await query("INSERT INTO product_images (url, alt, position, product_id) VALUES (?, ?, ?, ?)", [
      images[i],
      name,
      i,
      productId,
    ]);
  }

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function updateProduct(productId: number, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const comparePrice = formData.get("comparePrice") ? Number(formData.get("comparePrice")) : null;
  const shortDesc = String(formData.get("shortDesc") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const specs = String(formData.get("specs") ?? "").trim();
  const categoryId = Number(formData.get("categoryId"));
  const featured = formData.get("featured") === "on" ? 1 : 0;
  const inStock = formData.get("inStock") === "on" ? 1 : 0;
  const images = parseImages(String(formData.get("images") ?? ""));

  await query(
    `UPDATE products SET name=?, brand=?, price=?, compare_price=?, short_desc=?, description=?, specs=?, featured=?, in_stock=?, category_id=?
     WHERE id = ?`,
    [name, brand || null, price, comparePrice, shortDesc || null, description || null, specs || null, featured, inStock, categoryId, productId]
  );

  await query("DELETE FROM product_images WHERE product_id = ?", [productId]);
  for (let i = 0; i < images.length; i++) {
    await query("INSERT INTO product_images (url, alt, position, product_id) VALUES (?, ?, ?, ?)", [
      images[i],
      name,
      i,
      productId,
    ]);
  }

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  redirect("/admin/products");
}

export async function deleteProduct(productId: number) {
  await query("DELETE FROM products WHERE id = ?", [productId]);
  revalidatePath("/admin/products");
}
