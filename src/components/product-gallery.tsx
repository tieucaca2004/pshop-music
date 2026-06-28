"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductImage } from "@/types";

export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [active, setActive] = useState(0);
  const current = images[active];

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
        {current ? (
          <Image
            src={current.url}
            alt={current.alt ?? name}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">Không có ảnh</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Xem ảnh ${i + 1}`}
              aria-current={i === active}
              className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 transition-colors duration-200 ${
                i === active ? "border-accent" : "border-border hover:border-accent/50"
              }`}
            >
              <Image src={img.url} alt={img.alt ?? name} fill sizes="100px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
