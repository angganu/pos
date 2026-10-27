import { z } from "zod";
import { AttendanceStatus, type EmployeeWage } from "@prisma/client";
import { prisma, serialize } from "@/lib/db";
import { route, ok, qp, qpInt, audit, readJson } from "@/lib/api";
import { requirePerm, resolveStoreScope } from "@/lib/rbac";
import { assertEmployeeAccess, employedBetween, photoUrl, recountWage, storeLabel } from "@/lib/employees";
import { ATTENDANCE_STATUSES, daysBetween, parseDay, periodLabel, toDay, workDays } from "@/lib/wages";
import { HttpError } from "@/lib/errors";

/** The monthly recap is the longest range a screen asks for. */
const MAX_RANGE_DAYS = 62;

const dayParam = z.iso.date();

/**
 * GET /api/attendance?date=&storeId=         -> one day: every employee on the payroll that day
 * GET /api/attendance?from=&to=&storeId=     -> recap: each employee's status per day, with totals
 */
export const GET = route(async ({ user, req }) => {
  requirePerm(user, "attendance.manage");
  const params = qp(req);
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  const inStore = storeId ? { storeId } : {};

  if (params.has("date")) {
    const day = parseDay(z.object({ date: dayParam }).parse({ date: params.get("date") }).date);
    const employees = await prisma.employee.findMany({
      where: {
        ...inStore,
        ...employedBetween(day, day),
        // An inactive employee only shows where they already have a record.
        AND: [{ OR: [{ status: "ACTIVE" }, { attendances: { some: { date: day } } }] }],
      },
      include: {
        store: { select: { code: true, name: true } },
        photo: { select: { updatedAt: true } },
        attendances: { where: { date: day }, select: { status: true, note: true } },
        wages: {
          where: { status: "PAID", periodStart: { lte: day }, periodEnd: { gte: day } },
          select: { period: true, periodStart: true, periodEnd: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return ok(
      serialize({
        date: toDay(day),
        rows: employees.map((e) => {
          const paid = e.wages[0];
          return {
            employeeId: e.id,
            name: e.name,
            storeLabel: storeLabel(e.store),
            photoUrl: photoUrl(e.id, e.photo),
            wagePeriod: e.wagePeriod,
            status: e.attendances[0]?.status ?? null,
            note: e.attendances[0]?.note ?? null,
            /** Already in a paid wage: changing it would change pay that has gone out. */
            lockedBy: paid ? periodLabel(paid.period, toDay(paid.periodStart), toDay(paid.periodEnd)) : null,
          };
        }),
      })
    );
  }

  const { from, to } = z.object({ from: dayParam, to: dayParam }).parse({ from: params.get("from"), to: params.get("to") });
  const start = parseDay(from);
  const end = parseDay(to);
  const span = (end.getTime() - start.getTime()) / 86_400_000 + 1;
  if (span < 1 || span > MAX_RANGE_DAYS) {
    throw new HttpError(`Rentang tanggal harus 1 sampai ${MAX_RANGE_DAYS} hari.`, 422);
  }
  const days = daysBetween(from, to);
  const inRange = { date: { gte: start, lte: end } };

  const employees = await prisma.employee.findMany({
    where: {
      ...inStore,
      ...employedBetween(start, end),
      AND: [{ OR: [{ status: "ACTIVE" }, { attendances: { some: inRange } }] }],
    },
    include: {
      store: { select: { code: true, name: true } },
      photo: { select: { updatedAt: true } },
      attendances: { where: inRange, select: { date: true, status: true } },
    },
    orderBy: { name: "asc" },
  });

  return ok(
    serialize({
      from,
      to,
      days,
      rows: employees.map((e) => {
        const marks: Record<string, AttendanceStatus> = {};
        const counts = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, 0])) as Record<AttendanceStatus, number>;
        for (const a of e.attendances) {
          marks[toDay(a.date)] = a.status;
          counts[a.status] += 1;
        }
        return {
          employeeId: e.id,
          name: e.name,
          storeLabel: storeLabel(e.store),
          photoUrl: photoUrl(e.id, e.photo),
          joinedAt: toDay(e.joinedAt),
          resignAt: e.resignAt ? toDay(e.resignAt) : null,
          marks,
          counts,
          workDays: workDays(e.attendances.map((a) => a.status)),
        };
      }),
    })
  );
});

const putSchema = z.object({
  date: dayParam,
  entries: z
    .array(
      z.object({
        employeeId: z.number().int(),
        /** null clears the day back to "not recorded". */
        status: z.enum(AttendanceStatus).nullable(),
        note: z.string().trim().max(255).nullable().optional(),
      })
    )
    .min(1)
    .max(500),
});

/** Saves one day's attendance for many employees at once. */
export const PUT = route(async ({ user, req }) => {
  requirePerm(user, "attendance.manage");
  const body = putSchema.parse(await readJson(req));
  const day = parseDay(body.date);
  const ids = body.entries.map((e) => e.employeeId);
  if (new Set(ids).size !== ids.length) throw new Error("Satu karyawan tercantum lebih dari sekali.");

  await prisma.$transaction(async (tx) => {
    const employees = await tx.employee.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, name: true, storeId: true, joinedAt: true, resignAt: true,
        attendances: { where: { date: day }, select: { id: true } },
        wages: { where: { periodStart: { lte: day }, periodEnd: { gte: day } } },
      },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));

    const toCreate: { employeeId: number; status: AttendanceStatus; note: string | null }[] = [];
    // Rows with the same status and note are updated together: a day's sheet is mostly "Hadir".
    const toUpdate = new Map<string, { status: AttendanceStatus; note: string | null; ids: number[] }>();
    const toClear: number[] = [];
    const recount: { wage: EmployeeWage; name: string }[] = [];

    for (const entry of body.entries) {
      const e = byId.get(entry.employeeId);
      if (!e) throw new Error("Karyawan tidak ditemukan.");
      assertEmployeeAccess(user, e.storeId);
      if (day < e.joinedAt || (e.resignAt && day > e.resignAt)) {
        throw new Error(`${e.name} belum masuk atau sudah keluar pada tanggal ${body.date}.`);
      }
      const paid = e.wages.find((w) => w.status === "PAID");
      if (paid) {
        const period = periodLabel(paid.period, toDay(paid.periodStart), toDay(paid.periodEnd));
        throw new Error(
          `Absensi ${e.name} tanggal ${body.date} sudah masuk upah ${period} yang dibayar. Batalkan pembayarannya dulu di menu Upah.`
        );
      }
      for (const wage of e.wages) recount.push({ wage, name: e.name });

      const existing = e.attendances[0];
      const note = entry.note || null;
      if (entry.status === null) {
        if (existing) toClear.push(existing.id);
      } else if (!existing) {
        toCreate.push({ employeeId: e.id, status: entry.status, note });
      } else {
        const key = `${entry.status}|${note ?? ""}`;
        const group = toUpdate.get(key) ?? { status: entry.status, note, ids: [] };
        group.ids.push(existing.id);
        toUpdate.set(key, group);
      }
    }

    if (toClear.length) await tx.employeeAttendance.deleteMany({ where: { id: { in: toClear } } });
    if (toCreate.length) {
      await tx.employeeAttendance.createMany({ data: toCreate.map((c) => ({ ...c, date: day, userId: user.id })) });
    }
    for (const g of toUpdate.values()) {
      await tx.employeeAttendance.updateMany({
        where: { id: { in: g.ids } },
        data: { status: g.status, note: g.note, userId: user.id },
      });
    }
    // An unpaid wage over this day keeps counting the days it pays for.
    for (const { wage, name } of recount) await recountWage(tx, wage, name);
  });

  await audit(user.id, "save", "EmployeeAttendance", body.date, {
    entries: body.entries.map((e) => [e.employeeId, e.status]),
  });
  return ok({ date: body.date, count: body.entries.length });
});
