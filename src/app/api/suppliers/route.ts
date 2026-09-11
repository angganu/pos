import { z } from "zod";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qp, audit } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";

export const GET = route(async ({ req }) => {
  const q = qp(req).get("q")?.trim() ?? "";

  const suppliers = await prisma.supplier.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }] } : {}),
    },
    orderBy: { code: "asc" },
    include: {
      purchases: {
        select: { total: true, date: true, lines: { select: { itemId: true } } },
        orderBy: { date: "desc" },
        take: 200,
      },
    },
  });

  return ok(
    serialize(
      suppliers.map((s) => {
        const itemIds = new Set<number>();
        s.purchases.forEach((p) => p.lines.forEach((l) => itemIds.add(l.itemId)));
        return {
          id: s.id, code: s.code, name: s.name, address: s.address,
          phone: s.phone, pic: s.pic, terms: s.terms,
          purchaseCount: s.purchases.length,
          itemCount: itemIds.size,
          totalValue: s.purchases.reduce((a, p) => a + dec(p.total), 0),
          lastPurchase: s.purchases[0]?.date ?? null,
        };
      })
    )
  );
});

const schema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(160),
  address: z.string().max(255).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  pic: z.string().max(120).optional().nullable(),
  terms: z.string().max(80).optional().nullable(),
});

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "partner.manage");
  const data = schema.parse(await req.json());
  const supplier = await prisma.supplier.create({ data });
  await audit(user.id, "create", "Supplier", supplier.id, data);
  return ok(serialize(supplier), 201);
});

const patchSchema = schema.partial().extend({ id: z.number().int(), active: z.boolean().optional() });

export const PATCH = route(async ({ user, req }) => {
  requirePerm(user, "partner.manage");
  const { id, ...data } = patchSchema.parse(await req.json());
  const supplier = await prisma.supplier.update({ where: { id }, data });
  await audit(user.id, "update", "Supplier", id, data);
  return ok(serialize(supplier));
});
