"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import type { Category } from "@/types";

export function MobileNav({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Đóng menu" : "Mở menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-foreground hover:bg-card transition-colors duration-200"
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>
      {open && (
        <nav className="absolute left-0 right-0 top-full border-b border-border bg-background px-4 pb-4">
          <ul className="flex flex-col gap-1 pt-2">
            {categories.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={`/danh-muc/${cat.slug}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base font-medium hover:bg-card transition-colors duration-200"
                >
                  {cat.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/lien-he"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 text-base font-medium text-accent hover:bg-card transition-colors duration-200"
              >
                Liên hệ đặt hàng
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
