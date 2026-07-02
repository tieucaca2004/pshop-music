import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/types";

export function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0];

  return (
    <Link
      href={`/san-pham/${product.slug}`}
      className="group block cursor-pointer border border-border bg-card transition-colors duration-200 hover:border-accent/50"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-[#0d0d0d]">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt ?? product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs uppercase tracking-widest text-white/10">No image</span>
          </div>
        )}
        {!product.in_stock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">Hết hàng</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        {product.brand && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent">{product.brand}</p>
        )}
        <h3 className="mt-1.5 font-heading text-sm font-bold uppercase leading-snug tracking-wide text-foreground line-clamp-2">
          {product.name}
        </h3>

        {product.short_desc && (
          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {product.short_desc}
          </p>
        )}

        {/* Badge */}
        <div className="mt-3">
          <span className="inline-block border border-accent/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
            {product.in_stock ? "Chính hãng · BH 12th" : "Liên hệ"}
          </span>
        </div>

        <p className="mt-3 text-[11px] text-white/30">
          Liên hệ báo giá ·{" "}
          <span className="text-accent/80">0901 952 999</span>
        </p>
      </div>
    </Link>
  );
}
