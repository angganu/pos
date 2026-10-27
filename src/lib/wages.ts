/**
 * Pay periods, attendance and wage arithmetic, shared by the API, the screens and the seed.
 * Days travel as "YYYY-MM-DD" strings (DATE columns) and are worked on in UTC, so the
 * browser's or server's time zone can never shift a day.
 */
import type { AttendanceStatus, WagePeriod } from "@prisma/client";

export const PERIOD_LABEL: Record<WagePeriod, string> = {
  DAILY: "Harian",
  WEEKLY: "Mingguan",
  MONTHLY: "Bulanan",
};

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "HALF_DAY", "LEAVE", "SICK", "ABSENT"];

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Hadir",
  HALF_DAY: "Setengah hari",
  LEAVE: "Izin",
  SICK: "Sakit",
  ABSENT: "Alpa",
};

/** One-letter code for the monthly grid. */
export const ATTENDANCE_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: "H",
  HALF_DAY: "½",
  LEAVE: "I",
  SICK: "S",
  ABSENT: "A",
};

/** How much of a paid day each status is worth. */
export const PAID_DAY: Record<AttendanceStatus, number> = {
  PRESENT: 1,
  HALF_DAY: 0.5,
  LEAVE: 0,
  SICK: 0,
  ABSENT: 0,
};

export function workDays(statuses: AttendanceStatus[]): number {
  return statuses.reduce((sum, s) => sum + PAID_DAY[s], 0);
}

/** Rupiah amounts are stored with 2 decimals. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function wageTotal(days: number, dailyWage: number, allowance: number, deduction: number): number {
  return round2(days * dailyWage + allowance - deduction);
}

/** "YYYY-MM-DD" of a Date, read in UTC — how Prisma hands back a DATE column. */
export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDay(day: string): Date {
  return new Date(`${day.slice(0, 10)}T00:00:00.000Z`);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

/** Every day from start to end, both included. */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The pay period holding `day`: the day itself, its Monday–Sunday week, or its calendar month. */
export function periodRange(period: WagePeriod, day: string): { start: string; end: string } {
  if (period === "DAILY") return { start: day, end: day };
  const d = parseDay(day);
  if (period === "WEEKLY") {
    const sinceMonday = (d.getUTCDay() + 6) % 7;
    const start = addDays(day, -sinceMonday);
    return { start, end: addDays(start, 6) };
  }
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return { start: toDay(new Date(Date.UTC(y, m, 1))), end: toDay(new Date(Date.UTC(y, m + 1, 0))) };
}

/** The period before (-1) or after (+1) the one starting on `start`. */
export function shiftPeriod(period: WagePeriod, start: string, dir: -1 | 1): { start: string; end: string } {
  const { end } = periodRange(period, start);
  return periodRange(period, dir < 0 ? addDays(start, -1) : addDays(end, 1));
}

const DAY_FMT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const MONTH_FMT = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

/** "27 Okt 2026", "20 – 26 Okt 2026" or "Oktober 2026". */
export function periodLabel(period: WagePeriod, start: string, end: string): string {
  if (period === "DAILY") return DAY_FMT.format(parseDay(start));
  if (period === "MONTHLY") return MONTH_FMT.format(parseDay(start));
  return `${parseDay(start).getUTCDate()} – ${DAY_FMT.format(parseDay(end))}`;
}
