import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { getAllProductsAdmin } from "@/lib/admin-data";
import { deleteProduct } from "@/lib/actions/products";
import { formatVND } from "@/lib/format";
import { DeleteButton } from "@/components/admin/delete-button";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await getAllProductsAdmin().catch(() => []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Sản phẩm</h1>
        <Link
          href="/admin/products/new"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 transition-colors duration-200"
        >
          <Plus size={16} />
          Thêm sản phẩm
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Sản phẩm</th>
              <th className="px-4 py-3 font-medium">Danh mục</th>
              <th className="px-4 py-3 font-medium">Giá</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.category_name}</td>
                <td className="px-4 py-3">{formatVND(p.price)}</td>
                <td className="px-4 py-3">
                  {p.in_stock ? (
                    <span className="text-accent">Còn hàng</span>
                  ) : (
                    <span className="text-muted-foreground">Hết hàng</span>
                  )}
                  {p.featured ? <span className="ml-2 text-xs text-accent">★ Nổi bật</span> : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-foreground hover:bg-muted transition-colors duration-200"
                      aria-label="Sửa"
                    >
                      <Pencil size={16} />
                    </Link>
                    <DeleteButton action={deleteProduct.bind(null, p.id)} confirmText={`Xóa sản phẩm "${p.name}"?`} />
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Chưa có sản phẩm nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
