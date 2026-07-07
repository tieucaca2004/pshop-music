"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

export function MediaLibraryGrid({ images }: { images: string[] }) {
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  if (images.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Thư viện chưa có ảnh nào. Ảnh sẽ xuất hiện ở đây khi được thêm từ form sản phẩm.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {images.map((url, index) => (
        <div key={url} className="aspect-square overflow-hidden rounded-lg border border-border bg-muted">
          {broken[index] ? (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageOff size={20} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setBroken((prev) => ({ ...prev, [index]: true }))}
            />
          )}
        </div>
      ))}
    </div>
  );
}
