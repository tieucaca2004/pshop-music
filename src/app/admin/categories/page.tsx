import { getAllCategoriesAdmin } from "@/lib/admin-data";
import { createCategory, deleteCategory } from "@/lib/actions/categories";
import { DeleteButton } from "@/components/admin/delete-button";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await getAllCategoriesAdmin().catch(() => []);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Danh mục</h1>

      <form action={createCategory} className="mt-6 flex max-w-md gap-3">
        <input
          name="name"
          required
          placeholder="Tên danh mục mới"
          className="form-input mt-0"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 transition-colors duration-200"
        >
          Thêm
        </button>
      </form>

      <div className="mt-6 max-w-md overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Tên</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.slug}</td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton
                    action={deleteCategory.bind(null, c.id)}
                    confirmText={`Xóa danh mục "${c.name}"? Các sản phẩm thuộc danh mục này sẽ bị ảnh hưởng.`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
