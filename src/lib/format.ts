export function formatVND(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n) + "đ";
}

export function formatRelativeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value.replace(" ", "T")) : value;
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);

  if (diffMin < 1) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} ngày trước`;
}
