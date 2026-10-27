import { z } from "zod";
import { WagePeriod, WageStatus, type AttendanceStatus } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qp, qpInt, qpDate, audit, readJson } from "@/lib/api";
import { requirePerm, resolveStoreScope } from "@/lib/rbac";
import { assertEmployeeAccess, employedBetween, photoUrl, storeLabel } from "@/lib/employees";
import {
  ATTENDANCE_STATUSES, PERIOD_LABEL, parseDay, periodLabel, periodRange, toDay, wageTotal, workDays,
} from "@/lib/wages";

const dayParam = z.iso.date();
const money = z.number().nonnegative().max(1e12);

function countStatuses(statuses: AttendanceStatus[]) {
  const counts = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, 0])) as Record<AttendanceStatus, number>;
  for (const s of statuses) counts[s] += 1;
  return counts;
}

/**
 * GET /api/wages?period=&date=&storeId=   -> the pay sheet for the period holding `date`:
 *     everyone paid on that period, with days worked so far and their saved wage, if any
 * GET /api/wages?status=&employeeId=&from=&to=&storeId=   -> saved wages, newest period first
 */
export const GET = route(async ({ user, req }) => {
  requirePerm(user, "wage.manage");
  const params = qp(req);
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  const inStore = storeId ? { storeId } : {};

  if (params.has("period")) {
    const q = z
      .object({ period: z.enum(WagePeriod), date: dayParam })
      .parse({ period: params.get("period"), date: params.get("date") });
    const range = periodRange(q.period, q.date);
    const start = parseDay(range.start);
    const end = parseDay(range.end);
    const inRange = { date: { gte: start, lte: end } };

    const employees = await prisma.employee.findMany({
      where: {
        ...inStore,
        OR: [
          {
            wagePeriod: q.period,
            ...employedBetween(start, end),
            AND: [{ OR: [{ status: "ACTIVE" }, { attendances: { some: inRange } }] }],
          },
          // Already paid for exactly this period, whatever they are paid on now.
          { wages: { some: { period: q.period, periodStart: start } } },
        ],
      },
      include: {
        store: { select: { code: true, name: true } },
        photo: { select: { updatedAt: true } },
        attendances: { where: inRange, select: { status: true } },
        // Any wage overlapping this period: the one for it, or one that clashes with it.
        wages: { where: { periodStart: { lte: end }, periodEnd: { gte: start } } },
      },
      orderBy: { name: "asc" },
    });

    return ok(
      serialize({
        period: q.period,
        start: range.start,
        end: range.end,
        rows: employees.map((e) => {
          const statuses = e.attendances.map((a) => a.status);
          const wage = e.wages.find((w) => w.period === q.period && toDay(w.periodStart) === range.start);
          const clash = wage ? undefined : e.wages[0];
          return {
            employeeId: e.id,
            name: e.name,
            storeLabel: storeLabel(e.store),
            photoUrl: photoUrl(e.id, e.photo),
            wagePeriod: e.wagePeriod,
            counts: countStatuses(statuses),
            workDays: workDays(statuses),
            /** The employee's rate now; a saved wage keeps the rate it was saved with. */
            dailyWage: dec(e.dailyWage),
            wage: wage
              ? {
                  id: wage.id, workDays: dec(wage.workDays), dailyWage: dec(wage.dailyWage),
                  allowance: dec(wage.allowance), deduction: dec(wage.deduction), total: dec(wage.total),
                  status: wage.status, paidAt: wage.paidAt, note: wage.note,
                }
              : null,
            clash: clash ? periodLabel(clash.period, toDay(clash.periodStart), toDay(clash.periodEnd)) : null,
          };
        }),
      })
    );
  }

  const status = z.enum(WageStatus).optional().parse(params.get("status") || undefined);
  const employeeId = qpInt(req, "employeeId");
  const from = qpDate(req, "from");
  const to = qpDate(req, "to");

  const wages = await prisma.employeeWage.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(employeeId ? { employeeId } : {}),
      // Periods overlapping the asked range.
      ...(to ? { periodStart: { lte: to } } : {}),
      ...(from ? { periodEnd: { gte: from } } : {}),
      ...(storeId ? { employee: { storeId } } : {}),
    },
    include: {
      employee: {
        select: { name: true, store: { select: { code: true, name: true } }, photo: { select: { updatedAt: true } } },
      },
      user: { select: { name: true } },
    },
    orderBy: [{ periodStart: "desc" }, { employee: { name: "asc" } }],
    take: 1000,
  });

  return ok(
    serialize(
      wages.map((w) => ({
        id: w.id,
        employeeId: w.employeeId,
        name: w.employee.name,
        storeLabel: storeLabel(w.employee.store),
        photoUrl: photoUrl(w.employeeId, w.employee.photo),
        period: w.period,
        periodStart: toDay(w.periodStart),
        periodEnd: toDay(w.periodEnd),
        workDays: dec(w.workDays),
        dailyWage: dec(w.dailyWage),
        allowance: dec(w.allowance),
        deduction: dec(w.deduction),
        total: dec(w.total),
        status: w.status,
        paidAt: w.paidAt,
        note: w.note,
        userName: w.user.name,
      }))
    )
  );
});

const postSchema = z.object({
  period: z.enum(WagePeriod),
  /** Any day inside the period. */
  date: dayParam,
  entries: z
    .array(
      z.object({
        employeeId: z.number().int(),
        allowance: money.default(0),
        deduction: money.default(0),
        note: z.string().trim().max(255).nullable().optional(),
      })
    )
    .min(1)
    .max(500),
});

/** Calculates and saves the wages of one period, from the attendance recorded in it. */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "wage.manage");
  const body = postSchema.parse(await readJson(req));
  const range = periodRange(body.period, body.date);
  const start = parseDay(range.start);
  const end = parseDay(range.end);
  const label = periodLabel(body.period, range.start, range.end);
  const ids = body.entries.map((e) => e.employeeId);
  if (new Set(ids).size !== ids.length) throw new Error("Satu karyawan tercantum lebih dari sekali.");

  const count = await prisma.$transaction(async (tx) => {
    const employees = await tx.employee.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, name: true, storeId: true, wagePeriod: true, dailyWage: true,
        attendances: { where: { date: { gte: start, lte: end } }, select: { status: true } },
        wages: { where: { periodStart: { lte: end }, periodEnd: { gte: start } }, select: { id: true } },
      },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));

    const rows = body.entries.map((entry) => {
      const e = byId.get(entry.employeeId);
      if (!e) throw new Error("Karyawan tidak ditemukan.");
      assertEmployeeAccess(user, e.storeId);
      if (e.wagePeriod !== body.period) {
        throw new Error(`${e.name} dibayar ${PERIOD_LABEL[e.wagePeriod].toLowerCase()}, bukan ${PERIOD_LABEL[body.period].toLowerCase()}.`);
      }
      // Each day is paid once: no second wage over a day another wage already covers.
      if (e.wages.length) throw new Error(`${e.name} sudah punya upah yang mencakup ${label}.`);

      const days = workDays(e.attendances.map((a) => a.status));
      if (days === 0 && entry.allowance === 0) throw new Error(`${e.name} belum punya hari kerja pada ${label}.`);
      const dailyWage = dec(e.dailyWage);
      const total = wageTotal(days, dailyWage, entry.allowance, entry.deduction);
      if (total < 0) throw new Error(`Potongan upah ${e.name} melebihi upahnya.`);

      return {
        employeeId: e.id, period: body.period, periodStart: start, periodEnd: end,
        workDays: days, dailyWage, allowance: entry.allowance, deduction: entry.deduction, total,
        note: entry.note || null, userId: user.id,
      };
    });

    const created = await tx.employeeWage.createMany({ data: rows });
    return created.count;
  });

  await audit(user.id, "create", "EmployeeWage", `${body.period}:${range.start}`, { employeeIds: ids });
  return ok({ count }, 201);
});

const patchSchema = z.object({
  id: z.number().int(),
  allowance: money.optional(),
  deduction: money.optional(),
  note: z.string().trim().max(255).nullable().optional(),
});

/** Changes the allowance, deduction or note of a wage not yet paid. */
export const PATCH = route(async ({ user, req }) => {
  requirePerm(user, "wage.manage");
  const { id, ...data } = patchSchema.parse(await readJson(req));

  await prisma.$transaction(async (tx) => {
    const wage = await tx.employeeWage.findUniqueOrThrow({
      where: { id },
      include: { employee: { select: { name: true, storeId: true } } },
    });
    assertEmployeeAccess(user, wage.employee.storeId);
    if (wage.status === "PAID") throw new Error("Upah yang sudah dibayar tidak bisa diubah. Batalkan pembayarannya dulu.");

    const allowance = data.allowance ?? dec(wage.allowance);
    const deduction = data.deduction ?? dec(wage.deduction);
    const total = wageTotal(dec(wage.workDays), dec(wage.dailyWage), allowance, deduction);
    if (total < 0) throw new Error(`Potongan upah ${wage.employee.name} melebihi upahnya.`);

    // Still unpaid when written, not only when read: a payment made meanwhile stays as paid.
    const { count } = await tx.employeeWage.updateMany({
      where: { id, status: "UNPAID" },
      data: { allowance, deduction, total, ...(data.note !== undefined ? { note: data.note || null } : {}) },
    });
    if (!count) throw new Error("Upah ini baru saja dibayar, jadi tidak bisa diubah.");
  });

  await audit(user.id, "update", "EmployeeWage", id, data);
  return ok({ id });
});

/** Removes an unpaid wage, so the period can be calculated again. */
export const DELETE = route(async ({ user, req }) => {
  requirePerm(user, "wage.manage");
  const id = qpInt(req, "id");
  if (!id) throw new Error("Upah tidak valid.");

  const wage = await prisma.employeeWage.findUniqueOrThrow({
    where: { id },
    select: { status: true, employeeId: true, periodStart: true, employee: { select: { storeId: true } } },
  });
  assertEmployeeAccess(user, wage.employee.storeId);
  // The status check rides on the delete itself, so a payment made meanwhile is never lost.
  const { count } = await prisma.employeeWage.deleteMany({ where: { id, status: "UNPAID" } });
  if (!count) throw new Error("Upah yang sudah dibayar tidak bisa dihapus. Batalkan pembayarannya dulu.");

  await audit(user.id, "delete", "EmployeeWage", id, { employeeId: wage.employeeId, periodStart: toDay(wage.periodStart) });
  return ok({ id });
});
