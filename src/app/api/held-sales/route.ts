import { z } from "zod";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qpInt } from "@/lib/api";
import { resolveStoreScope, assertStoreAccess } from "@/lib/rbac";

/** Parked sales — the cart is stored as JSON until a cashier resumes it. */
export const GET = route(async ({ user, req }) => {
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  const held = await prisma.heldSale.findMany({
    where: { ...(storeId ? { storeId } : {}) },
    include: { customer: { select: { name: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return ok(
    serialize(
      held.map((h) => ({
        id: h.id, label: h.label, total: dec(h.total),
        customer: h.customer?.name ?? "Pelanggan Umum",
        user: h.user.name, createdAt: h.createdAt, payload: h.payload,
      }))
    )
  );
});

const schema = z.object({
  storeId: z.number().int(),
  label: z.string().min(1).max(120),
  customerId: z.number().int().nullable().default(null),
  total: z.number().min(0).default(0),
  payload: z.any(),
});

export const POST = route(async ({ user, req }) => {
  const body = schema.parse(await req.json());
  assertStoreAccess(user, body.storeId);

  const held = await prisma.heldSale.create({
    data: {
      storeId: body.storeId, userId: user.id, customerId: body.customerId,
      label: body.label, total: body.total, payload: body.payload,
    },
  });
  return ok(serialize({ id: held.id }), 201);
});

export const DELETE = route(async ({ user, req }) => {
  const id = qpInt(req, "id");
  if (!id) throw new Error("id wajib diisi.");
  const held = await prisma.heldSale.findUniqueOrThrow({ where: { id } });
  assertStoreAccess(user, held.storeId);
  await prisma.heldSale.delete({ where: { id } });
  return ok({ id });
});
