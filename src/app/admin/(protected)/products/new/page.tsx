import { getAllCategoriesAdmin } from "@/lib/admin-data";
import { createProduct } from "@/lib/actions/products";
import { ProductForm } from "@/components/admin/product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const categories = await getAllCategoriesAdmin().catch(() => []);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Thêm sản phẩm</h1>
      <div className="mt-6 max-w-3xl rounded-xl border border-border bg-card p-6">
        <ProductForm action={createProduct} categories={categories} />
      </div>
    </div>
  );
}
