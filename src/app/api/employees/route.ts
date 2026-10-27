import { z } from "zod";
import { EmployeeStatus, Gender, WagePeriod } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qp, qpInt, audit, readJson } from "@/lib/api";
import { can, requirePerm } from "@/lib/rbac";
import { parsePhoto, photoUrl, storeLabel } from "@/lib/employees";

/**
 * GET /api/employees              -> every employee, with its login if it has one
 * GET /api/employees?available=1  -> active employees without a login (for Pengguna)
 */
export const GET = route(async ({ user, req }) => {
  // The Pengguna screen picks the employee for a new login from this list.
  if (!can(user, "user.manage")) requirePerm(user, "employee.manage");
  const available = qp(req).get("available") === "1";

  const employees = await prisma.employee.findMany({
    where: available ? { status: "ACTIVE", user: { is: null } } : {},
    include: {
      store: { select: { code: true, name: true } },
      user: { select: { id: true, email: true, role: true, active: true } },
      photo: { select: { updatedAt: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return ok(
    serialize(
      employees.map(({ store, photo, dailyWage, ...e }) => ({
        ...e,
        dailyWage: dec(dailyWage),
        storeLabel: storeLabel(store),
        photoUrl: photoUrl(e.id, photo),
      }))
    )
  );
});

/** "YYYY-MM-DD" from a date input, stored in a DATE column. */
const day = z.iso.date().transform((s) => new Date(s));

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  gender: z.enum(Gender),
  birthDate: day.nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.email().max(160).nullable().optional(),
  joinedAt: day,
  resignAt: day.nullable().optional(),
  status: z.enum(EmployeeStatus).optional(),
  storeId: z.number().int().nullable().optional(),
  wagePeriod: z.enum(WagePeriod),
  dailyWage: z.number().nonnegative().max(1e12),
  /** A data: URL sets the photo, null removes it, leaving it out keeps it. */
  photo: z.string().max(1_000_000).nullable().optional(),
});

function checkDates(joinedAt: Date, resignAt: Date | null | undefined, birthDate: Date | null | undefined) {
  if (resignAt && resignAt < joinedAt) throw new Error("Tanggal keluar tidak boleh sebelum tanggal masuk.");
  if (birthDate && birthDate >= joinedAt) throw new Error("Tanggal lahir harus sebelum tanggal masuk.");
}

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "employee.manage");
  const { photo, ...data } = schema.parse(await readJson(req));
  checkDates(data.joinedAt, data.resignAt, data.birthDate);
  const image = photo ? parsePhoto(photo) : null;

  const employee = await prisma.employee.create({
    data: { ...data, ...(image ? { photo: { create: image } } : {}) },
  });
  await audit(user.id, "create", "Employee", employee.id, serialize({ ...data, photo: Boolean(image) }));
  return ok({ id: employee.id }, 201);
});

const patchSchema = schema.partial().extend({ id: z.number().int() });

export const PATCH = route(async ({ user, req }) => {
  requirePerm(user, "employee.manage");
  const { id, photo, ...data } = patchSchema.parse(await readJson(req));

  const cur = await prisma.employee.findUniqueOrThrow({
    where: { id },
    select: { joinedAt: true, resignAt: true, birthDate: true, user: { select: { id: true } } },
  });
  // A partial update still has to fit the dates it leaves untouched.
  const keep = <T>(sent: T | undefined, stored: T) => (sent !== undefined ? sent : stored);
  checkDates(keep(data.joinedAt, cur.joinedAt), keep(data.resignAt, cur.resignAt), keep(data.birthDate, cur.birthDate));
  if (data.status === "INACTIVE" && cur.user?.id === user.id) {
    throw new Error("Anda tidak bisa menonaktifkan data karyawan Anda sendiri — akun Anda ikut nonaktif.");
  }
  const image = photo ? parsePhoto(photo) : null;

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data });
    if (image) {
      await tx.employeePhoto.upsert({ where: { employeeId: id }, create: { employeeId: id, ...image }, update: image });
    } else if (photo === null) {
      await tx.employeePhoto.deleteMany({ where: { employeeId: id } });
    }
    // The login follows its employee: the same name, and it stops working once the
    // employee is inactive. Reactivating the employee leaves the login for an admin.
    if (cur.user && (data.name || data.status === "INACTIVE")) {
      await tx.user.update({
        where: { id: cur.user.id },
        data: { ...(data.name ? { name: data.name } : {}), ...(data.status === "INACTIVE" ? { active: false } : {}) },
      });
    }
  });

  const photoChange = photo === undefined ? undefined : image ? "changed" : "removed";
  await audit(user.id, "update", "Employee", id, serialize({ ...data, photo: photoChange }));
  return ok({ id });
});

export const DELETE = route(async ({ user, req }) => {
  requirePerm(user, "employee.manage");
  const id = qpInt(req, "id");
  if (!id) throw new Error("Karyawan tidak valid.");

  // A real delete, allowed only for an employee nothing points at yet;
  // status INACTIVE is how one leaves while keeping their history.
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id },
    select: { name: true, user: { select: { id: true } }, _count: { select: { attendances: true, wages: true } } },
  });
  if (employee.user) {
    throw new Error("Karyawan ini punya akun pengguna, jadi tidak bisa dihapus. Nonaktifkan saja.");
  }
  if (employee._count.attendances || employee._count.wages) {
    throw new Error("Karyawan sudah punya catatan absensi atau upah, jadi tidak bisa dihapus. Nonaktifkan saja.");
  }
  await prisma.employee.delete({ where: { id } });
  await audit(user.id, "delete", "Employee", id, { name: employee.name });
  return ok({ id });
});
