import type { EmployeeWage, Prisma } from "@prisma/client";
import type { SessionUser } from "./auth";
import { dec } from "./db";
import { AuthError, HttpError } from "./errors";
import { can } from "./rbac";
import { periodLabel, toDay, wageTotal, workDays } from "./wages";

/** The browser shrinks photos to a few dozen KB before upload; this only stops abuse. */
const MAX_PHOTO_BYTES = 512 * 1024;

/** Leading bytes of each accepted image type, so a declared type can't lie about the file. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP",
};

/** A "data:image/…;base64,…" URL from the photo picker → what EmployeePhoto stores. */
export function parsePhoto(dataUrl: string): { mimeType: string; data: Uint8Array<ArrayBuffer> } {
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
  const check = m && SIGNATURES[m[1]];
  if (!m || !check) throw new HttpError("Foto harus berupa gambar JPG, PNG atau WebP.", 422);
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_PHOTO_BYTES) throw new HttpError("Ukuran foto maksimal 512 KB.", 413);
  if (!check(bytes)) throw new HttpError("Isi file foto tidak sesuai jenisnya.", 422);
  // Prisma's Bytes takes a plain Uint8Array; a Buffer may sit on a shared pool.
  return { mimeType: m[1], data: new Uint8Array(bytes) };
}

/** Versioned by the photo's last change, so a new photo never shows the cached old one. */
export function photoUrl(employeeId: number, photo: { updatedAt: Date } | null): string | null {
  return photo ? `/api/employees/${employeeId}/photo?v=${photo.updatedAt.getTime()}` : null;
}

export function storeLabel(store: { code: string; name: string } | null): string | null {
  return store ? `${store.code} · ${store.name}` : null;
}

/** Store-pinned roles (manager) only see and record their own store's employees. */
export function assertEmployeeAccess(user: SessionUser, employeeStoreId: number | null) {
  if (can(user, "store.all")) return;
  if (employeeStoreId === null || employeeStoreId !== user.storeId) throw new AuthError("FORBIDDEN:store", 403);
}

/** Employees on the payroll at some point between from and to (both DATE values). */
export function employedBetween(from: Date, to: Date): Prisma.EmployeeWhereInput {
  return { joinedAt: { lte: to }, OR: [{ resignAt: null }, { resignAt: { gte: from } }] };
}

/**
 * Counts an unpaid wage's work days again from its attendance, after that attendance
 * changed. Its daily wage, allowance and deduction stay as they were saved.
 */
export async function recountWage(tx: Prisma.TransactionClient, wage: EmployeeWage, employeeName: string) {
  const rows = await tx.employeeAttendance.findMany({
    where: { employeeId: wage.employeeId, date: { gte: wage.periodStart, lte: wage.periodEnd } },
    select: { status: true },
  });
  const days = workDays(rows.map((r) => r.status));
  const total = wageTotal(days, dec(wage.dailyWage), dec(wage.allowance), dec(wage.deduction));
  if (total < 0) {
    const period = periodLabel(wage.period, toDay(wage.periodStart), toDay(wage.periodEnd));
    throw new Error(`Potongan upah ${employeeName} (${period}) jadi melebihi upahnya. Kurangi potongannya dulu di menu Upah.`);
  }
  // Only while it is still unpaid: a wage paid meanwhile keeps the days it was paid for.
  const { count } = await tx.employeeWage.updateMany({ where: { id: wage.id, status: "UNPAID" }, data: { workDays: days, total } });
  if (!count) throw new Error(`Upah ${employeeName} baru saja dibayar, jadi absensinya tidak bisa diubah lagi.`);
}
