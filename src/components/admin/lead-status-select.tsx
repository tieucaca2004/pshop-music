"use client";

import { useTransition } from "react";

const statuses = [
  { value: "new", label: "Mới" },
  { value: "contacted", label: "Đã liên hệ" },
  { value: "done", label: "Hoàn tất" },
  { value: "cancelled", label: "Đã hủy" },
];

export function LeadStatusSelect({
  leadId,
  status,
  onUpdate,
}: {
  leadId: number;
  status: string;
  onUpdate: (leadId: number, status: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => startTransition(() => onUpdate(leadId, e.target.value))}
      className="cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
    >
      {statuses.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}
