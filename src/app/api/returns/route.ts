import { z } from "zod";
import { MovementType, ReturnType, type Prisma } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, fail, qp, qpInt, audit, readJson } from "@/lib/api";
import { requirePerm, resolveStoreScope, assertStoreAccess } from "@/lib/rbac";
import { applyMovement, assertStockAvailable, nextSeq } from "@/lib/stock";
import { round2, round4 } from "@/lib/units";
import { docCode } from "@/lib/format";

/** GET /api/returns?saleCode=TRX-000123 -> look up a receipt to return against */
export const GET = route(async ({ user, req }) => {
  const saleCode = qp(req).get("saleCode")?.trim();
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));

  if (saleCode) {
    const sale = await prisma.sale.findFirst({
      where: { code: saleCode, ...(storeId ? { storeId } : {}) },
      include: {
        store: { select: { name: true } },
        customer: { select: { name: true, code: true } },
        lines: { include: { item: { include: { baseUnit: true } } } },
        returns: { include: { lines: true } },
      },
    });
    if (!sale) return fail("Struk tidak ditemukan di toko ini.", 404);

    // Subtract what has already been returned, so nothing is refunded twice.
    const returned = new Map<number, number>();
    sale.returns.forEach((r) =>
      r.lines.forEach((l) => returned.set(l.itemId, (returned.get(l.itemId) ?? 0) + dec(l.qty)))
    );

    return ok(
      serialize({
        id: sale.id, code: sale.code, date: sale.date,
        store: sale.store.name, customer: sale.customer?.name ?? "Pelanggan Umum",
        total: dec(sale.total),
        lines: sale.lines.map((l) => {
          const already = returned.get(l.itemId) ?? 0;
          return {
            itemId: l.itemId, name: l.item.name, code: l.item.code,
            unit: l.item.baseUnit.name, qty: dec(l.qty),
            returnedQty: already, returnableQty: Math.max(0, dec(l.qty) - already),
            unitPrice: dec(l.unitPrice), total: dec(l.total),
          };
        }),
      })
    );
  }

  const returns = await prisma.returnDoc.findMany({
    where: { ...(storeId ? { storeId } : {}) },
    include: {
      store: { select: { name: true } }, user: { select: { name: true } },
      sale: { select: { code: true } }, supplier: { select: { name: true } },
      lines: { include: { item: { select: { name: true } } } },
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  return ok(
    serialize(
      returns.map((r) => ({
        id: r.id, code: r.code, type: r.type, date: r.date,
        store: r.store.name, user: r.user.name,
        reference: r.sale?.code ?? r.supplier?.name ?? "—",
        reason: r.reason, total: dec(r.total), lineCount: r.lines.length,
      }))
    )
  );
});

const schema = z.object({
  type: z.nativeEnum(ReturnType),
  storeId: z.number().int(),
  saleId: z.number().int().nullable().default(null),
  supplierId: z.number().int().nullable().default(null),
  reason: z.string().max(255).optional().nullable(),
  lines: z
    .array(
      z.object({
        itemId: z.number().int(),
        qty: z.number().positive(),
        price: z.number().min(0),
      })
    )
    .min(1, "Pilih minimal satu barang."),
});

/**
 * SALE return     -> money back to the customer, stock comes BACK IN.
 * PURCHASE return -> goods go back to the supplier, stock goes OUT.
 */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "return.manage");
  const body = schema.parse(await readJson(req));
  assertStoreAccess(user, body.storeId);

  const isSaleReturn = body.type === ReturnType.SALE;
  if (isSaleReturn && !body.saleId) throw new Error("Retur penjualan wajib merujuk ke struk.");

  const doc = await prisma.$transaction(async (tx) => {
    // A refund's items, quantities and prices come from the original receipt,
    // never from the client — otherwise anyone could refund goods never sold.
    const lines = isSaleReturn
      ? await saleReturnLines(tx, body.saleId!, body.storeId, body.lines)
      : body.lines;

    const seq = await nextSeq(tx, "returnDoc");
    const total = round2(lines.reduce((a, l) => a + l.qty * l.price, 0));

    const created = await tx.returnDoc.create({
      data: {
        code: docCode(isSaleReturn ? "RTJ" : "RTB", seq),
        type: body.type, storeId: body.storeId, userId: user.id,
        saleId: body.saleId, supplierId: body.supplierId,
        reason: body.reason ?? null, total,
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId, qty: l.qty, price: l.price, total: round2(l.qty * l.price),
          })),
        },
      },
    });

    for (const l of lines) {
      if (!isSaleReturn) await assertStockAvailable(tx, l.itemId, body.storeId, l.qty);
      await applyMovement(tx, {
        itemId: l.itemId, storeId: body.storeId,
        qty: isSaleReturn ? l.qty : -l.qty,
        type: isSaleReturn ? MovementType.RETURN_IN : MovementType.RETURN_OUT,
        userId: user.id, unitCost: l.price,
        refType: "ReturnDoc", refId: created.id, note: body.reason ?? undefined,
      });
    }

    return created;
  });

  await audit(user.id, "create", "ReturnDoc", doc.id, { code: doc.code, type: body.type });
  return ok(serialize({ id: doc.id, code: doc.code, total: dec(doc.total) }), 201);
});

/**
 * Checks a sale return against its receipt and prices each line from it.
 * The sale row is locked first, so two returns of the same receipt submitted
 * at once cannot both pass the "already returned" check.
 */
async function saleReturnLines(
  tx: Prisma.TransactionClient,
  saleId: number,
  storeId: number,
  requested: { itemId: number; qty: number }[]
) {
  await tx.$queryRaw`SELECT id FROM \`Sale\` WHERE id = ${saleId} FOR UPDATE`;

  const sale = await tx.sale.findFirst({
    where: { id: saleId, storeId, status: "POSTED" },
    include: { lines: true, returns: { include: { lines: true } } },
  });
  if (!sale) throw new Error("Struk tidak ditemukan di toko ini.");

  const sold = new Map<number, { qty: number; price: number }>();
  for (const l of sale.lines) {
    const cur = sold.get(l.itemId);
    sold.set(l.itemId, { qty: (cur?.qty ?? 0) + dec(l.qty), price: cur?.price ?? dec(l.unitPrice) });
  }
  const returned = new Map<number, number>();
  sale.returns.forEach((r) =>
    r.lines.forEach((l) => returned.set(l.itemId, (returned.get(l.itemId) ?? 0) + dec(l.qty)))
  );
  const wanted = new Map<number, number>();
  for (const l of requested) wanted.set(l.itemId, (wanted.get(l.itemId) ?? 0) + l.qty);

  return [...wanted].map(([itemId, qty]) => {
    const line = sold.get(itemId);
    if (!line) throw new Error("Barang yang diretur tidak ada di struk ini.");
    const returnable = round4(line.qty - (returned.get(itemId) ?? 0));
    if (qty > returnable) throw new Error(`Jumlah retur melebihi sisa yang bisa diretur (${returnable}).`);
    return { itemId, qty, price: line.price };
  });
}
