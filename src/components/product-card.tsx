import Link from "next/link";
import Image from "next/image";
import { formatVND } from "@/lib/format";
import type { Product } from "@/types";

export function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0];
  const onSale = product.compare_price && Number(product.compare_price) > Number(product.price);

  return (
    <Link
      href={`/san-pham/${product.slug}`}
      className="group block cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors duration-200 hover:border-accent"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt ?? product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Không có ảnh
          </div>
        )}
        {onSale && (
          <span className="absolute left-2 top-2 rounded-md bg-destructive px-2 py-1 text-xs font-bold text-white">
            Giảm giá
          </span>
        )}
        {!product.in_stock && (
          <span className="absolute right-2 top-2 rounded-md bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
            Hết hàng
          </span>
        )}
      </div>
      <div className="p-4">
        {product.brand && (
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">{product.brand}</p>
        )}
        <h3 className="mt-1 line-clamp-2 font-heading text-base font-semibold text-foreground">
          {product.name}
        </h3>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-lg font-bold text-foreground">{formatVND(product.price)}</span>
          {onSale && (
            <span className="text-sm text-muted-foreground line-through">
              {formatVND(product.compare_price!)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
