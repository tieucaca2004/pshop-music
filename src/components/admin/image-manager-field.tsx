"use client";

import { useRef, useState, useTransition } from "react";
import { GripVertical, ImageOff, Plus, X } from "lucide-react";
import { fetchMediaLibrary } from "@/lib/actions/media";

const PLACEHOLDER_ALT = "Ảnh sản phẩm";

export function ImageManagerField({
  name,
  defaultImages,
}: {
  name: string;
  defaultImages: string[];
}) {
  const [images, setImages] = useState<string[]>(defaultImages);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<string[]>([]);
  const [libraryLoading, startLibraryLoad] = useTransition();
  const [advancedUrl, setAdvancedUrl] = useState("");
  const dragIndex = useRef<number | null>(null);

  function openLibrary() {
    setLibraryOpen((open) => !open);
    if (library.length === 0) {
      startLibraryLoad(async () => {
        const urls = await fetchMediaLibrary();
        setLibrary(urls);
      });
    }
  }

  function addUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed || images.includes(trimmed)) return;
    setImages((prev) => [...prev, trimmed]);
  }

  function removeAt(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setBroken((prev) => {
      const next: Record<number, boolean> = {};
      for (const key of Object.keys(prev)) {
        const i = Number(key);
        if (i < index) next[i] = prev[i];
        else if (i > index) next[i - 1] = prev[i];
      }
      return next;
    });
  }

  function handleDrop(index: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setBroken({});
  }

  return (
    <div>
      <input type="hidden" name={name} value={images.join("\n")} />

      <div className="flex flex-wrap gap-3">
        {images.map((url, index) => (
          <div
            key={`${url}-${index}`}
            draggable
            onDragStart={() => (dragIndex.current = index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="group relative h-24 w-24 cursor-grab overflow-hidden rounded-lg border border-border bg-muted active:cursor-grabbing"
          >
            {broken[index] ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                <ImageOff size={20} />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={PLACEHOLDER_ALT}
                className="h-full w-full object-cover"
                onError={() => setBroken((prev) => ({ ...prev, [index]: true }))}
              />
            )}
            <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100">
              <GripVertical size={12} />
            </div>
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label="Xóa ảnh"
              className="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-destructive"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={openLibrary}
          className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-accent hover:text-accent transition-colors duration-200"
        >
          <Plus size={18} />
          Thêm ảnh
        </button>
      </div>

      {images.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Chưa có ảnh nào. Chọn từ thư viện hoặc thêm ảnh mới.
        </p>
      )}

      {libraryOpen && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Thư viện ảnh</p>
            <button
              type="button"
              onClick={() => setLibraryOpen(false)}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              aria-label="Đóng thư viện"
            >
              <X size={16} />
            </button>
          </div>
          {libraryLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">Đang tải...</p>
          ) : library.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Thư viện chưa có ảnh nào. Dùng mục &quot;Nâng cao&quot; bên dưới để thêm ảnh mới bằng URL.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {library.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => addUrl(url)}
                  disabled={images.includes(url)}
                  className="h-16 w-16 cursor-pointer overflow-hidden rounded border border-border disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <details className="mt-4 rounded-lg border border-border">
        <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          Nâng cao (URL ảnh)
        </summary>
        <div className="space-y-3 border-t border-border p-4">
          <div className="flex gap-2">
            <input
              value={advancedUrl}
              onChange={(e) => setAdvancedUrl(e.target.value)}
              placeholder="https://..."
              className="form-input mt-0"
            />
            <button
              type="button"
              onClick={() => {
                addUrl(advancedUrl);
                setAdvancedUrl("");
              }}
              className="shrink-0 cursor-pointer rounded-lg border border-accent px-4 text-xs font-semibold text-accent transition-colors duration-200 hover:bg-accent hover:text-accent-foreground"
            >
              Thêm
            </button>
          </div>
          {images.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {images.map((url, i) => (
                <li key={`${url}-${i}`} className="truncate font-mono">
                  {url}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
