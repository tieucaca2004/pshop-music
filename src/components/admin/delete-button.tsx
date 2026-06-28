"use client";

import { Trash2 } from "lucide-react";

export function DeleteButton({
  action,
  confirmText = "Bạn có chắc muốn xóa mục này?",
}: {
  action: () => void;
  confirmText?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm(confirmText)) action();
      }}
      aria-label="Xóa"
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors duration-200"
    >
      <Trash2 size={16} />
    </button>
  );
}
