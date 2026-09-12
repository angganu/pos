import { z } from "zod";
import { MovementType } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, fail, qp, qpInt, qpDate, audit } from "@/lib/api";
import { requirePerm, resolveStoreScope, assertStoreAccess } from "@/lib/rbac";
import { applyMovement, nextSeq } from "@/lib/stock";
import { setPrice } from "@/lib/pricing";
import { round2, round4, toBaseQty, toBasePrice } from "@/lib/units";
import { docCode } from "@/lib/format";

export const GET = route(async ({ user, req }) => {
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  const from = qpDate(req, "from");
  const to = qpDate(req, "to");
  const id = qpInt(req, "id");
  const q = qp(req).get("q")?.trim();
  const supplierId = qpInt(req, "supplierId");
  const itemId = qpInt(req, "itemId");

  if (id) {
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        store: true, supplier: true, user: { select: { name: true } },
        lines: { include: { item: { include: { baseUnit: true } } } },
      },
    });
    if (!purchase) return fail("Transaksi tidak ditemukan.", 404);
    return ok(
      serialize({
        ...purchase,
        subtotal: dec(purchase.subtotal), discount: dec(purchase.discount),
        tax: dec(purchase.tax), total: dec(purchase.total),
        lines: purchase.lines.map((l) => ({
          id: l.id, itemName: l.item.name, itemCode: l.item.code,
          unitLabel: l.unitLabel, factor: dec(l.factor),
          qty: dec(l.qty), baseQty: dec(l.baseQty), baseUnit: l.item.baseUnit.name,
          pricePerUnit: dec(l.pricePerUnit), pricePerBase: dec(l.pricePerBase),
          discount: dec(l.discount), total: dec(l.total),
        })),
      })
    );
  }

  const purchases = await prisma.purchase.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(itemId ? { lines: { some: { itemId } } } : {}),
      ...(q
        ? { OR: [{ code: { contains: q } }, { supplier: { name: { contains: q } } }, { supplier: { code: { contains: q } } }] }
        : {}),
    },
    include: {
      supplier: { select: { code: true, name: true } },
      store: { select: { code: true, name: true } },
      user: { select: { name: true } },
      lines: { include: { item: { select: { code: true, name: true } } } },
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  return ok(
    serialize(
      purchases.map((p) => ({
        id: p.id, code: p.code, date: p.date,
        supplier: p.supplier.name, store: p.store.name, user: p.user.name,
        subtotal: dec(p.subtotal), discount: dec(p.discount),
        tax: dec(p.tax), total: dec(p.total), status: p.status,
        lineCount: p.lines.length,
        lines: p.lines.map((l) => ({
          item: l.item.name, itemCode: l.item.code, unitLabel: l.unitLabel,
          qty: dec(l.qty), baseQty: dec(l.baseQty),
          pricePerUnit: dec(l.pricePerUnit), pricePerBase: dec(l.pricePerBase),
          total: dec(l.total),
        })),
      }))
    )
  );
});

const schema = z.object({
  supplierId: z.number().int(),
  storeId: z.number().int(),
  date: z.string().optional(),
  discount: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  note: z.string().max(255).optional().nullable(),
  lines: z
    .array(
      z.object({
        itemId: z.number().int(),
        unitLabel: z.string().min(1),
        factor: z.number().positive(),
        qty: z.number().positive(),
        pricePerUnit: z.number().min(0),
        discount: z.number().min(0).default(0),
      })
    )
    .min(1, "Minimal satu barang."),
  /** Optional new selling prices to apply once the goods land. */
  newPrices: z
    .array(
      z.object({
        itemId: z.number().int(),
        storeId: z.number().int(),
        customerId: z.number().int().nullable(),
        price: z.number().min(0),
      })
    )
    .default([]),
});

/**
 * Posting a purchase does four things atomically:
 *   1. writes the document + lines (with unit conversion to base units)
 *   2. raises stock and writes a StockMovement per line
 *   3. records the new cost per base unit (the HPP)
 *   4. optionally applies the new selling prices per store / per member
 */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "purchase.manage");
  const body = schema.parse(await req.json());
  assertStoreAccess(user, body.storeId);

  const result = await prisma.$transaction(async (tx) => {
    const seq = await nextSeq(tx, "purchase");
    const when = body.date ? new Date(body.date) : new Date();

    const lines = body.lines.map((l) => {
      const baseQty = toBaseQty(l.qty, l.factor);
      const pricePerBase = toBasePrice(l.pricePerUnit, l.factor);
      const total = round2(l.qty * l.pricePerUnit - l.discount);
      return { ...l, baseQty, pricePerBase, total };
    });

    const subtotal = round2(lines.reduce((a, l) => a + l.total, 0));
    const total = round2(subtotal - body.discount + body.tax);

    const purchase = await tx.purchase.create({
      data: {
        code: docCode("PB", seq, when),
        supplierId: body.supplierId, storeId: body.storeId, userId: user.id,
        date: when, subtotal, discount: body.discount, tax: body.tax, total,
        note: body.note ?? null,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId, unitLabel: l.unitLabel, factor: l.factor,
            qty: l.qty, baseQty: l.baseQty,
            pricePerUnit: l.pricePerUnit, pricePerBase: l.pricePerBase,
            discount: l.discount, total: l.total,
          })),
        },
      },
    });

    for (const l of lines) {
      await applyMovement(tx, {
        itemId: l.itemId, storeId: body.storeId, qty: l.baseQty,
        type: MovementType.PURCHASE, userId: user.id, unitCost: l.pricePerBase,
        refType: "Purchase", refId: purchase.id,
        note: `${l.qty} × ${l.unitLabel}`,
      });
    }

    return purchase;
  });

  // Selling prices are applied outside the stock transaction so a pricing
  // typo can be corrected without unwinding the goods receipt.
  for (const p of body.newPrices) {
    assertStoreAccess(user, p.storeId);
    await setPrice(p.itemId, p.storeId, p.customerId, p.price);
  }

  await audit(user.id, "create", "Purchase", result.id, {
    code: result.code, lines: body.lines.length, priceUpdates: body.newPrices.length,
  });

  return ok(serialize({ id: result.id, code: result.code, total: dec(result.total) }), 201);
});
