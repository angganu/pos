import { z } from "zod";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, fail, audit } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";

type Params = { id: string };

export const GET = route<Params>(async ({ params }) => {
  const id = Number(params.id);
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      category: true,
      baseUnit: true,
      itemUnits: { include: { unit: true }, orderBy: [{ isBase: "desc" }, { factor: "asc" }] },
      stocks: { include: { store: true } },
      prices: { include: { store: true, customer: true } },
    },
  });
  if (!item) return fail("Barang tidak ditemukan.", 404);

  return ok(
    serialize({
      ...item,
      units: item.itemUnits.map((u) => ({ id: u.id, unitId: u.unitId, label: u.label, factor: dec(u.factor), isBase: u.isBase })),
      stocks: item.stocks.map((s) => ({
        storeId: s.storeId, storeName: s.store.name, storeCode: s.store.code,
        stock: dec(s.stock), minStock: dec(s.minStock),
      })),
      prices: item.prices.map((p) => ({
        id: p.id, storeId: p.storeId, storeName: p.store.name,
        customerId: p.customerId, customerName: p.customer?.name ?? null, price: dec(p.price),
      })),
    })
  );
});

const patchSchema = z.object({
  name: z.string().min(1).max(180).optional(),
  barcode: z.string().max(60).nullable().optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().max(400).nullable().optional(),
  categoryId: z.number().int().optional(),
  active: z.boolean().optional(),
  minStock: z.number().min(0).optional(),
  units: z
    .array(z.object({ unitId: z.number().int(), label: z.string().min(1).max(80), factor: z.number().positive() }))
    .optional(),
});

export const PATCH = route<Params>(async ({ user, req, params }) => {
  requirePerm(user, "item.manage");
  const id = Number(params.id);
  const body = patchSchema.parse(await req.json());

  await prisma.$transaction(async (tx) => {
    const { units, minStock, ...rest } = body;
    if (Object.keys(rest).length) await tx.item.update({ where: { id }, data: rest });
    if (minStock !== undefined) await tx.itemStock.updateMany({ where: { itemId: id }, data: { minStock } });

    if (units) {
      await tx.itemUnit.deleteMany({ where: { itemId: id, isBase: false } });
      for (const u of units) {
        await tx.itemUnit.create({
          data: { itemId: id, unitId: u.unitId, label: u.label, factor: u.factor, isBase: false },
        });
      }
    }
  });

  await audit(user.id, "update", "Item", id, body);
  return ok({ id });
});

export const DELETE = route<Params>(async ({ user, params }) => {
  requirePerm(user, "item.manage");
  const id = Number(params.id);

  // Soft delete — hard-deleting would orphan sales history.
  await prisma.item.update({ where: { id }, data: { active: false } });
  await audit(user.id, "deactivate", "Item", id);
  return ok({ id, active: false });
});
