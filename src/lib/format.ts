export function formatVND(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n) + "đ";
}
