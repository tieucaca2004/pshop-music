"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const STORAGE_PREFIX = "psh-admin-form-section:";

export function FormSection({
  id,
  title,
  description,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring persisted UI state on mount, not syncing render state
    if (stored !== null) setOpen(stored === "1");
  }, [id]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_PREFIX + id, next ? "1" : "0");
      return next;
    });
  }

  return (
    <section className="rounded-xl border border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {description && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
          )}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="space-y-4 border-t border-border px-5 py-5">{children}</div>}
    </section>
  );
}
