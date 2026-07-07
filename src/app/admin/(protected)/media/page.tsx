import { getMediaLibrary } from "@/lib/admin-data";
import { MediaLibraryGrid } from "@/components/admin/media-library-grid";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const images = await getMediaLibrary().catch(() => []);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Thư viện ảnh</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Toàn bộ ảnh đã từng dùng cho sản phẩm — có thể chọn lại khi thêm hoặc sửa sản phẩm. Trang này chỉ đọc dữ
        liệu; để thêm ảnh mới, vào form sản phẩm.
      </p>
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <MediaLibraryGrid images={images} />
      </div>
    </div>
  );
}
