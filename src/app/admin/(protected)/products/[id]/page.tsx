import { notFound } from "next/navigation";
import { getAllCategoriesAdmin, getProductByIdAdmin } from "@/lib/admin-data";
import { updateProduct } from "@/lib/actions/products";
import { ProductForm } from "@/components/admin/product-form";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditProductPage({ params }: { params: Params }) {
  const { id } = await params;
  const productId = Number(id);

  const [product, categories] = await Promise.all([
    getProductByIdAdmin(productId).catch(() => null),
    getAllCategoriesAdmin().catch(() => []),
  ]);

  if (!product) notFound();

  const action = updateProduct.bind(null, productId);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Sửa sản phẩm</h1>
      <div className="mt-6 max-w-3xl rounded-xl border border-border bg-card p-6">
        <ProductForm action={action} categories={categories} product={product} />
      </div>
    </div>
  );
}
