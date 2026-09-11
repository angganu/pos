/** Indonesian Rupiah + number formatting used across every screen. */

const RP = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const RP2 = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function rp(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return "Rp " + RP.format(Math.round(n));
}

export function rpExact(value: number | string | null | undefined): string {
  return "Rp " + RP2.format(Number(value ?? 0));
}

export function num(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isInteger(n) ? RP.format(n) : RP.format(Math.round(n * 100) / 100);
}

export function qty(value: number | string | null | undefined, unit?: string): string {
  return num(value) + (unit ? ` ${unit}` : "");
}

export function pct(value: number | null | undefined, digits = 0): string {
  return `${(Number(value ?? 0) * 100).toFixed(digits)}%`;
}

export function marginPct(price: number, cost: number): number {
  if (!price) return 0;
  return (price - cost) / price;
}

const DATE = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const DATETIME = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const TIME = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });

export function fdate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return DATE.format(new Date(d));
}
export function fdatetime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return DATETIME.format(new Date(d));
}
export function ftime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return TIME.format(new Date(d));
}

/** Parses "12.500" / "Rp 12.500" / "12500" into 12500. */
export function parseRp(input: string): number {
  const cleaned = String(input).replace(/[^\d,-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Sequential document codes: PB-2609-0031 style. */
export function docCode(prefix: string, seq: number, when = new Date()): string {
  const yy = String(when.getFullYear()).slice(2);
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  return `${prefix}-${yy}${mm}-${String(seq).padStart(4, "0")}`;
}
