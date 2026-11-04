export function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2
  }).format(Number(value ?? 0));
}
export function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}
export function monthEnd(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString().slice(0, 10);
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value + "T00:00:00"));
}
