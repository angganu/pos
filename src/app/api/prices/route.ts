import { z } from "zod";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qpInt, audit } from "@/lib/api";
import { requirePerm, resolveStoreScope } from "@/lib/rbac";
import { setPrice, clearPrice } from "@/lib/pricing";

/**
 * GET  /api/prices?itemId=  -> the full store × customer matrix for one item
 * PUT  /api/prices          -> bulk upsert (null price clears the cell)
 */
export const GET = route(async ({ user, req }) => {
  requirePerm(user, "price.manage");
  const itemId = qpInt(req, "itemId");
  if (!itemId) return ok({ stores: [], customers: [], cells: [] });

  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));

  const [item, stores, customers, prices] = await Promise.all([
    prisma.item.findUniqueOrThrow({
      where: { id: itemId },
      include: { baseUnit: true, category: true },
    }),
    prisma.store.findMany({
      where: { active: true, ...(storeId ? { id: storeId } : {}) },
      orderBy: { code: "asc" },
    }),
    prisma.customer.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.itemPrice.findMany({ where: { itemId, ...(storeId ? { storeId } : {}) } }),
  ]);

  // Latest purchase cost, so margin can be shown next to every price.
  const lastBuy = await prisma.purchaseLine.findFirst({
    where: { itemId },
    orderBy: { id: "desc" },
    select: { pricePerBase: true },
  });
  const cost = lastBuy ? dec(lastBuy.pricePerBase) : 0;

  const stockRows = await prisma.itemStock.findMany({ where: { itemId } });

  return ok(
    serialize({
      item: {
        id: item.id, code: item.code, name: item.name,
        unit: item.baseUnit.name, unitCode: item.baseUnit.code,
        category: item.category.name, cost,
      },
      stores: stores.map((s) => ({
        id: s.id, code: s.code, name: s.name,
        stock: dec(stockRows.find((r) => r.storeId === s.id)?.stock ?? 0),
      })),
      customers: customers.map((c) => ({ id: c.id, code: c.code, name: c.name, tier: c.tier })),
      cells: prices.map((p) => ({
        storeId: p.storeId, customerId: p.customerId, price: dec(p.price),
      })),
    })
  );
});

const putSchema = z.object({
  itemId: z.number().int(),
  cells: z.array(
    z.object({
      storeId: z.number().int(),
      customerId: z.number().int().nullable(),
      price: z.number().min(0).nullable(),
    })
  ),
});

export const PUT = route(async ({ user, req }) => {
  requirePerm(user, "price.manage");
  const { itemId, cells } = putSchema.parse(await req.json());

  for (const c of cells) {
    // Managers may only touch their own store's prices.
    if (user.storeId && user.role === "MANAGER" && c.storeId !== user.storeId) continue;

    if (c.price === null) {
      // A member cell cleared = that member falls back to the general price.
      if (c.customerId !== null) await clearPrice(itemId, c.storeId, c.customerId);
    } else {
      await setPrice(itemId, c.storeId, c.customerId, c.price);
    }
  }

  await audit(user.id, "update", "ItemPrice", itemId, { count: cells.length });
  return ok({ itemId, updated: cells.length });
});
