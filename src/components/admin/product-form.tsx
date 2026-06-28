import type { Category, Product } from "@/types";

export function ProductForm({
  action,
  categories,
  product,
}: {
  action: (formData: FormData) => void;
  categories: Category[];
  product?: Product;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên sản phẩm" required>
          <input
            name="name"
            defaultValue={product?.name}
            required
            className="form-input"
          />
        </Field>
        <Field label="Thương hiệu">
          <input name="brand" defaultValue={product?.brand ?? ""} className="form-input" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Danh mục" required>
          <select name="categoryId" defaultValue={product?.category_id} required className="form-input">
            <option value="">-- Chọn danh mục --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Giá bán (VNĐ)" required>
          <input
            type="number"
            name="price"
            min={0}
            step={1000}
            defaultValue={product?.price}
            required
            className="form-input"
          />
        </Field>
        <Field label="Giá gốc (nếu giảm giá)">
          <input
            type="number"
            name="comparePrice"
            min={0}
            step={1000}
            defaultValue={product?.compare_price ?? ""}
            className="form-input"
          />
        </Field>
      </div>

      <Field label="Mô tả ngắn">
        <textarea name="shortDesc" defaultValue={product?.short_desc ?? ""} rows={2} className="form-input" />
      </Field>

      <Field label="Mô tả chi tiết">
        <textarea name="description" defaultValue={product?.description ?? ""} rows={5} className="form-input" />
      </Field>

      <Field label="Thông số kỹ thuật" hint='Định dạng: "Tên: giá trị | Tên: giá trị"'>
        <textarea name="specs" defaultValue={product?.specs ?? ""} rows={3} className="form-input" />
      </Field>

      <Field label="Ảnh sản phẩm" hint="Mỗi URL ảnh trên một dòng">
        <textarea
          name="images"
          defaultValue={product?.images?.map((i) => i.url).join("\n") ?? ""}
          rows={4}
          className="form-input font-mono text-xs"
        />
      </Field>

      <div className="flex items-center gap-6">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="featured" defaultChecked={!!product?.featured} className="h-4 w-4 accent-orange-500" />
          Sản phẩm nổi bật
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="inStock" defaultChecked={product ? !!product.in_stock : true} className="h-4 w-4 accent-orange-500" />
          Còn hàng
        </label>
      </div>

      <button
        type="submit"
        className="cursor-pointer rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 transition-colors duration-200"
      >
        {product ? "Lưu thay đổi" : "Tạo sản phẩm"}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
