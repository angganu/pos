import { z } from "zod";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qp, qpInt, audit } from "@/lib/api";
import { requirePerm, resolveStoreScope } from "@/lib/rbac";

/** GET /api/items?q=&categoryId=&storeId=&lowOnly=1 */
export const GET = route(async ({ user, req }) => {
  const params = qp(req);
  const q = params.get("q")?.trim() ?? "";
  const categoryId = qpInt(req, "categoryId");
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  const lowOnly = params.get("lowOnly") === "1";

  const items = await prisma.item.findMany({
    where: {
      active: true,
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? { OR: [{ name: { contains: q } }, { code: { contains: q } }, { barcode: { contains: q } }] }
        : {}),
    },
    include: {
      category: true,
      baseUnit: true,
      itemUnits: { include: { unit: true }, orderBy: [{ isBase: "desc" }, { factor: "asc" }] },
      stocks: storeId ? { where: { storeId } } : true,
      prices: {
        where: { ...(storeId ? { storeId } : {}) },
        include: { customer: { select: { id: true, code: true, name: true } }, store: { select: { id: true, code: true } } },
      },
    },
    orderBy: { name: "asc" },
    take: 400,
  });

  const shaped = items.map((it) => {
    const stock = it.stocks.reduce((a, s) => a + dec(s.stock), 0);
    const minStock = it.stocks[0] ? dec(it.stocks[0].minStock) : 0;
    const general = it.prices.filter((p) => p.customerId === null).map((p) => dec(p.price));
    return {
      id: it.id, code: it.code, barcode: it.barcode, name: it.name,
      description: it.description, imageUrl: it.imageUrl,
      category: { id: it.category.id, name: it.category.name },
      baseUnit: { id: it.baseUnit.id, code: it.baseUnit.code, name: it.baseUnit.name },
      units: it.itemUnits.map((u) => ({ id: u.id, label: u.label, factor: dec(u.factor), isBase: u.isBase })),
      stock, minStock, low: stock < minStock,
      stockByStore: it.stocks.map((s) => ({ storeId: s.storeId, stock: dec(s.stock), minStock: dec(s.minStock) })),
      priceMin: general.length ? Math.min(...general) : 0,
      priceMax: general.length ? Math.max(...general) : 0,
      memberPriceCount: it.prices.filter((p) => p.customerId !== null).length,
      prices: it.prices.map((p) => ({
        id: p.id, storeId: p.storeId, customerId: p.customerId,
        customerName: p.customer?.name ?? null, price: dec(p.price),
      })),
    };
  });

  return ok(serialize(lowOnly ? shaped.filter((s) => s.low) : shaped));
});

const createSchema = z.object({
  code: z.string().min(1).max(40),
  barcode: z.string().max(60).optional().nullable(),
  name: z.string().min(1).max(180),
  description: z.string().optional().nullable(),
  imageUrl: z.string().max(400).optional().nullable(),
  categoryId: z.number().int(),
  baseUnitId: z.number().int(),
  minStock: z.number().min(0).default(0),
  units: z
    .array(z.object({ unitId: z.number().int(), label: z.string().min(1).max(80), factor: z.number().positive() }))
    .default([]),
  prices: z
    .array(z.object({ storeId: z.number().int(), customerId: z.number().int().nullable(), price: z.number().min(0) }))
    .default([]),
});

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "item.manage");
  const body = createSchema.parse(await req.json());

  const item = await prisma.$transaction(async (tx) => {
    const baseUnit = await tx.unit.findUniqueOrThrow({ where: { id: body.baseUnitId } });

    const created = await tx.item.create({
      data: {
        code: body.code, barcode: body.barcode || null, name: body.name,
        description: body.description ?? null, imageUrl: body.imageUrl ?? null,
        categoryId: body.categoryId, baseUnitId: body.baseUnitId,
      },
    });

    // The base unit always exists with factor 1 — selling always happens here.
    await tx.itemUnit.create({
      data: { itemId: created.id, unitId: body.baseUnitId, label: baseUnit.name, factor: 1, isBase: true },
    });
    for (const u of body.units) {
      await tx.itemUnit.create({
        data: { itemId: created.id, unitId: u.unitId, label: u.label, factor: u.factor, isBase: false },
      });
    }

    const stores = await tx.store.findMany({ where: { active: true }, select: { id: true } });
    await tx.itemStock.createMany({
      data: stores.map((s) => ({ itemId: created.id, storeId: s.id, stock: 0, minStock: body.minStock })),
    });
    for (const p of body.prices) {
      await tx.itemPrice.create({
        data: { itemId: created.id, storeId: p.storeId, customerId: p.customerId, price: p.price },
      });
    }
    return created;
  });

  await audit(user.id, "create", "Item", item.id, { code: item.code });
  return ok(serialize(item), 201);
});
