import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma, serialize } from "@/lib/db";
import { route, ok, audit, readJson } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { hashPassword, createSession, PASSWORD_MAX } from "@/lib/auth";

export const GET = route(async ({ user }) => {
  requirePerm(user, "user.manage");
  const users = await prisma.user.findMany({
    include: { store: { select: { code: true, name: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return ok(
    serialize(
      users.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role,
        employeeId: u.employeeId, storeId: u.storeId,
        storeLabel: u.store ? `${u.store.code} · ${u.store.name}` : "Semua toko",
        active: u.active, lastLoginAt: u.lastLoginAt,
      }))
    )
  );
});

const schema = z.object({
  /** The employee this login is for; the user's name is the employee's. */
  employeeId: z.number().int(),
  email: z.email(),
  password: z.string().min(8, "Kata sandi minimal 8 karakter").max(PASSWORD_MAX),
  role: z.enum(Role),
  storeId: z.number().int().nullable().default(null),
});

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "user.manage");
  const body = schema.parse(await readJson(req));

  if ((body.role === "MANAGER" || body.role === "CASHIER") && !body.storeId) {
    throw new Error("Manajer dan kasir wajib ditugaskan ke satu toko.");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: body.employeeId },
    select: { name: true, status: true, user: { select: { id: true } } },
  });
  if (!employee) throw new Error("Karyawan tidak ditemukan.");
  if (employee.user) throw new Error("Karyawan ini sudah punya akun pengguna.");
  if (employee.status !== "ACTIVE") throw new Error("Karyawan nonaktif tidak bisa diberi akun.");

  const created = await prisma.user.create({
    data: {
      name: employee.name, employeeId: body.employeeId, email: body.email.toLowerCase(), role: body.role,
      storeId: body.role === "ADMIN" || body.role === "OWNER" ? null : body.storeId,
      passwordHash: await hashPassword(body.password),
    },
  });

  await audit(user.id, "create", "User", created.id, { email: created.email, role: created.role });
  return ok(serialize({ id: created.id, email: created.email }), 201);
});

// No name: it is the employee's, changed on the Karyawan screen.
const patchSchema = z.object({
  id: z.number().int(),
  role: z.enum(Role).optional(),
  storeId: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(PASSWORD_MAX).optional(),
});

export const PATCH = route(async ({ user, req }) => {
  requirePerm(user, "user.manage");
  const { id, password, ...rest } = patchSchema.parse(await readJson(req));

  if (id === user.id && rest.active === false) {
    throw new Error("Anda tidak bisa menonaktifkan akun Anda sendiri.");
  }
  if (rest.active) {
    const { employee } = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { employee: { select: { status: true } } },
    });
    if (employee.status !== "ACTIVE") {
      throw new Error("Karyawannya sudah nonaktif. Aktifkan dulu data karyawannya di menu Karyawan.");
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
  });

  // A new password ends every older session; keep the admin who did it signed in.
  if (password && id === user.id) await createSession(updated);

  await audit(user.id, "update", "User", id, rest);
  return ok({ id });
});
