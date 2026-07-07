"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Save, Trash2, X } from "lucide-react";

/** Standardized action bar for admin CMS forms: Lưu / Hủy / Xóa. */
export function FormActionBar({
  cancelHref,
  deleteAction,
  deleteConfirmText,
  submitLabel = "Lưu",
}: {
  cancelHref: string;
  deleteAction?: () => Promise<void>;
  deleteConfirmText?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const { pending } = useFormStatus();
  const [deleting, startDelete] = useTransition();

  function handleDelete() {
    if (!deleteAction) return;
    if (!confirm(deleteConfirmText ?? "Bạn có chắc muốn xóa mục này?")) return;
    startDelete(async () => {
      await deleteAction();
      router.push(cancelHref);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      <div>
        {deleteAction && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || pending}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-destructive transition-colors duration-200 hover:bg-destructive/10 disabled:opacity-60"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Xóa
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Link
          href={cancelHref}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-muted"
        >
          <X size={16} />
          Hủy
        </Link>
        <button
          type="submit"
          disabled={pending || deleting}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-colors duration-200 hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
