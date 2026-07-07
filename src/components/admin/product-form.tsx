"use client";

import { cloneElement, isValidElement, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import type { Category, Product } from "@/types";
import { ImageManagerField } from "@/components/admin/image-manager-field";
import { FormSection } from "@/components/admin/form-section";
import { FormActionBar } from "@/components/admin/form-action-bar";

type FieldErrors = Record<string, string>;

export function ProductForm({
  action,
  categories,
  product,
  cancelHref = "/admin/products",
  deleteAction,
}: {
  action: (formData: FormData) => void;
  categories: Category[];
  product?: Product;
  cancelHref?: string;
  deleteAction?: () => Promise<void>;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    const data = new FormData(e.currentTarget);
    const nextErrors: FieldErrors = {};

    if (!String(data.get("name") ?? "").trim()) {
      nextErrors.name = "Vui lòng nhập tên sản phẩm.";
    }
    if (!data.get("categoryId")) {
      nextErrors.categoryId = "Vui lòng chọn danh mục.";
    }
    const price = Number(data.get("price") ?? 0);
    if (!price || price <= 0) {
      nextErrors.price = "Vui lòng nhập giá bán hợp lệ.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      e.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormSection id="basic-info" title="Thông tin cơ bản" defaultOpen>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên sản phẩm" required error={errors.name}>
            <input name="name" defaultValue={product?.name} className="form-input" />
          </Field>
          <Field label="Thương hiệu">
            <input name="brand" defaultValue={product?.brand ?? ""} className="form-input" />
          </Field>
        </div>

        <Field label="Danh mục" required error={errors.categoryId}>
          <select name="categoryId" defaultValue={product?.category_id} className="form-input">
            <option value="">-- Chọn danh mục --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Mô tả ngắn">
          <textarea name="shortDesc" defaultValue={product?.short_desc ?? ""} rows={2} className="form-input" />
        </Field>

        <Field label="Mô tả chi tiết">
          <textarea name="description" defaultValue={product?.description ?? ""} rows={5} className="form-input" />
        </Field>

        <Field label="Thông số kỹ thuật" hint='Định dạng: "Tên: giá trị | Tên: giá trị"'>
          <textarea name="specs" defaultValue={product?.specs ?? ""} rows={3} className="form-input" />
        </Field>
      </FormSection>

      <FormSection id="images" title="Hình ảnh" defaultOpen>
        <ImageManagerField name="images" defaultImages={product?.images?.map((i) => i.url) ?? []} />
      </FormSection>

      <FormSection id="pricing-stock" title="Giá & Kho" defaultOpen>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Giá bán (VNĐ)" required error={errors.price}>
            <input type="number" name="price" min={0} step={1000} defaultValue={product?.price} className="form-input" />
          </Field>
          <Field label="Giá gốc (nếu giảm giá)">
            <input type="number" name="comparePrice" min={0} step={1000} defaultValue={product?.compare_price ?? ""} className="form-input" />
          </Field>
        </div>

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
      </FormSection>

      <FormSection
        id="advanced"
        title="Nâng cao"
        description="Thông tin kỹ thuật, chỉ dùng khi cần hỗ trợ hoặc tra cứu."
        defaultOpen={false}
      >
        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">ID sản phẩm</dt>
            <dd className="mt-0.5 font-mono text-foreground">{product ? product.id : "Sẽ được tạo sau khi lưu"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Slug (đường dẫn công khai)</dt>
            <dd className="mt-0.5 break-all font-mono text-foreground">{product ? product.slug : "Sẽ được tạo tự động từ tên sản phẩm"}</dd>
          </div>
        </dl>
      </FormSection>

      <FormActionBar
        cancelHref={cancelHref}
        deleteAction={deleteAction}
        deleteConfirmText={product ? `Xóa sản phẩm "${product.name}"?` : undefined}
        submitLabel={product ? "Lưu thay đổi" : "Tạo sản phẩm"}
      />
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const child =
    error && isValidElement(children)
      ? cloneElement(children as ReactElement<{ className?: string }>, {
          className: `${(children as ReactElement<{ className?: string }>).props.className ?? ""} border-destructive focus-visible:outline-destructive`.trim(),
        })
      : children;

  return (
    <div>
      <label className="block text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {child}
      {error ? (
        <p className="mt-1 text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
