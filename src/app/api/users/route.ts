import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma, serialize } from "@/lib/db";
import { route, ok, audit } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";

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
        storeId: u.storeId,
        storeLabel: u.store ? `${u.store.code} · ${u.store.name}` : "Semua toko",
        active: u.active, lastLoginAt: u.lastLoginAt,
      }))
    )
  );
});

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8, "Kata sandi minimal 8 karakter"),
  role: z.nativeEnum(Role),
  storeId: z.number().int().nullable().default(null),
});

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "user.manage");
  const body = schema.parse(await req.json());

  if ((body.role === "MANAGER" || body.role === "CASHIER") && !body.storeId) {
    throw new Error("Manajer dan kasir wajib ditugaskan ke satu toko.");
  }

  const created = await prisma.user.create({
    data: {
      name: body.name, email: body.email.toLowerCase(), role: body.role,
      storeId: body.role === "ADMIN" || body.role === "OWNER" ? null : body.storeId,
      passwordHash: await hashPassword(body.password),
    },
  });

  await audit(user.id, "create", "User", created.id, { email: created.email, role: created.role });
  return ok(serialize({ id: created.id, email: created.email }), 201);
});

const patchSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(120).optional(),
  role: z.nativeEnum(Role).optional(),
  storeId: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const PATCH = route(async ({ user, req }) => {
  requirePerm(user, "user.manage");
  const { id, password, ...rest } = patchSchema.parse(await req.json());

  if (id === user.id && rest.active === false) {
    throw new Error("Anda tidak bisa menonaktifkan akun Anda sendiri.");
  }

  await prisma.user.update({
    where: { id },
    data: { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
  });

  await audit(user.id, "update", "User", id, rest);
  return ok({ id });
});
