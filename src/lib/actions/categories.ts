"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { slugify } from "@/lib/slugify";
import { requireAdminAction } from "@/lib/auth";

export async function createCategory(formData: FormData) {
  await requireAdminAction();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Vui lòng nhập tên danh mục.");

  const slug = slugify(name);
  await query(
    "INSERT INTO categories (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
    [name, slug]
  );
  revalidatePath("/admin/categories");
}

export async function deleteCategory(categoryId: number) {
  await requireAdminAction();
  await query("DELETE FROM categories WHERE id = ?", [categoryId]);
  revalidatePath("/admin/categories");
}
