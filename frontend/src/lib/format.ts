/** "2026-11-03" -> "Nov 3, 2026" (parsed as a local date, so no timezone shift). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** "court_notice" -> "Court notice". */
export function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "250.0" -> "$250.00". Returns the input unchanged if it is not a number. */
export function formatMoney(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency: "USD" }) : amount;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Whole days from today until "YYYY-MM-DD" (negative if in the past). */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 86_400_000);
}

/** "13:30:00" -> "1:30 PM". */
export function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Tomorrow", or "Fri, Oct 11", with the time when there is one: "Tomorrow, 10:00 AM". */
export function formatWhen(iso: string, time: string | null): string {
  const days = daysUntil(iso);
  const [y, m, d] = iso.split("-").map(Number);
  const day =
    days === 0 ? "Today"
    : days === 1 ? "Tomorrow"
    : days === -1 ? "Yesterday"
    : new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return time ? `${day}, ${formatClock(time)}` : day;
}
