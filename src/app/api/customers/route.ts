import { z } from "zod";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qp, audit } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";

export const GET = route(async ({ req }) => {
  const q = qp(req).get("q")?.trim() ?? "";

  const customers = await prisma.customer.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }, { phone: { contains: q } }] } : {}),
    },
    orderBy: { code: "asc" },
    include: {
      _count: { select: { sales: true, prices: true } },
      sales: { select: { total: true, date: true }, orderBy: { date: "desc" }, take: 500 },
    },
  });

  return ok(
    serialize(
      customers.map((c) => {
        const spend = c.sales.reduce((a, s) => a + dec(s.total), 0);
        return {
          id: c.id, code: c.code, name: c.name, address: c.address, phone: c.phone,
          tier: c.tier, points: c.points,
          txCount: c._count.sales, specialPriceCount: c._count.prices,
          totalSpend: spend, avgSpend: c._count.sales ? spend / c._count.sales : 0,
          lastPurchase: c.sales[0]?.date ?? null,
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
  tier: z.string().max(40).default("Member"),
});

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "partner.manage");
  const data = schema.parse(await req.json());
  const customer = await prisma.customer.create({ data });
  await audit(user.id, "create", "Customer", customer.id, data);
  return ok(serialize(customer), 201);
});

const patchSchema = schema.partial().extend({ id: z.number().int(), active: z.boolean().optional() });

export const PATCH = route(async ({ user, req }) => {
  requirePerm(user, "partner.manage");
  const { id, ...data } = patchSchema.parse(await req.json());
  const customer = await prisma.customer.update({ where: { id }, data });
  await audit(user.id, "update", "Customer", id, data);
  return ok(serialize(customer));
});
