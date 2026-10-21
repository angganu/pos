import { z } from "zod";
import { MovementType } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, fail, qp, qpInt, qpDate, audit, readJson } from "@/lib/api";
import { requirePerm, resolveStoreScope, assertStoreAccess } from "@/lib/rbac";
import { applyMovement, assertStockAvailable, nextSeq } from "@/lib/stock";
import { round2, round4 } from "@/lib/units";
import { docCode } from "@/lib/format";

/** What was actually paid per base unit on a purchase line, after its discount. */
function netUnitCost(line: { total: unknown; baseQty: unknown }) {
  const base = dec(line.baseQty);
  return base ? round4(dec(line.total) / base) : 0;
}

/**
 * GET /api/rejects?summary=1&from=&to=      -> reject rate per supplier (lowest = best quality)
 * GET /api/rejects?purchaseCode=PB-2610-0001 -> an invoice's lines, with how much can still be rejected
 * GET /api/rejects                           -> reject history
 */
export const GET = route(async ({ user, req }) => {
  // The supplier summary is a read-only report on the Laporan page; everything else serves the reject screen.
  const summary = qp(req).get("summary") === "1";
  requirePerm(user, summary ? "report.view" : "reject.manage");
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  const storeWhere = storeId ? { storeId } : {};
  const purchaseCode = qp(req).get("purchaseCode")?.trim();

  if (summary) {
    const from = qpDate(req, "from");
    const to = qpDate(req, "to");
    const dateWhere = from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

    const [bought, rejected, suppliers] = await Promise.all([
      prisma.purchase.groupBy({
        by: ["supplierId"],
        where: { status: "POSTED", ...storeWhere, ...dateWhere },
        _sum: { subtotal: true },
        _count: { _all: true },
      }),
      // Rejects are dated by the invoice they came from, so the rate always compares
      // goods bought in the range against the part of those same goods that was rejected.
      prisma.reject.groupBy({
        by: ["supplierId"],
        where: { ...storeWhere, ...(from || to ? { purchase: dateWhere } : {}) },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.supplier.findMany({ select: { id: true, code: true, name: true } }),
    ]);

    const supplierOf = new Map(suppliers.map((s) => [s.id, s]));
    const rejectOf = new Map(rejected.map((r) => [r.supplierId, r]));

    // Rate by value, not quantity: quantities mix units (Kg, Pcs, Liter) and can't be summed.
    const rows = bought.map((b) => {
      const r = rejectOf.get(b.supplierId);
      const purchaseValue = round2(dec(b._sum.subtotal ?? 0));
      const rejectValue = round2(dec(r?._sum.total ?? 0));
      return {
        supplierId: b.supplierId,
        code: supplierOf.get(b.supplierId)?.code ?? "—",
        name: supplierOf.get(b.supplierId)?.name ?? "—",
        purchaseCount: b._count._all, purchaseValue,
        rejectCount: r?._count._all ?? 0, rejectValue,
        rejectRate: purchaseValue ? rejectValue / purchaseValue : 0,
      };
    });
    rows.sort((a, b) => a.rejectRate - b.rejectRate || b.purchaseValue - a.purchaseValue);
    return ok(serialize(rows));
  }

  if (purchaseCode) {
    const purchase = await prisma.purchase.findFirst({
      where: { code: purchaseCode, status: "POSTED", ...storeWhere },
      include: {
        store: { select: { name: true } },
        supplier: { select: { name: true } },
        lines: {
          include: {
            item: { include: { baseUnit: true } },
            rejectLines: { select: { qty: true } },
          },
        },
      },
    });
    if (!purchase) return fail("Faktur pembelian tidak ditemukan di toko ini.", 404);

    const stocks = await prisma.itemStock.findMany({
      where: { storeId: purchase.storeId, itemId: { in: purchase.lines.map((l) => l.itemId) } },
    });
    const stockOf = new Map(stocks.map((s) => [s.itemId, dec(s.stock)]));

    return ok(
      serialize({
        id: purchase.id, code: purchase.code, date: purchase.date,
        store: purchase.store.name, supplier: purchase.supplier.name,
        lines: purchase.lines.map((l) => {
          const rejectedQty = round4(l.rejectLines.reduce((a, r) => a + dec(r.qty), 0));
          const stock = stockOf.get(l.itemId) ?? 0;
          return {
            purchaseLineId: l.id, itemId: l.itemId, name: l.item.name, code: l.item.code,
            unit: l.item.baseUnit.name, unitLabel: l.unitLabel, factor: dec(l.factor),
            qty: dec(l.qty), baseQty: dec(l.baseQty), unitCost: netUnitCost(l),
            rejectedQty, stock,
            // Can't reject more than arrived, nor more than is still on the shelf.
            rejectableQty: Math.max(0, Math.min(round4(dec(l.baseQty) - rejectedQty), stock)),
          };
        }),
      })
    );
  }

  const rejects = await prisma.reject.findMany({
    where: storeWhere,
    include: {
      purchase: { select: { code: true } },
      supplier: { select: { name: true } },
      store: { select: { name: true } },
      user: { select: { name: true } },
      lines: {
        include: {
          item: { select: { name: true, baseUnit: { select: { name: true } } } },
          purchaseLine: { select: { unitLabel: true, factor: true } },
        },
      },
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  return ok(
    serialize(
      rejects.map((r) => ({
        id: r.id, code: r.code, date: r.date,
        purchaseCode: r.purchase.code, supplier: r.supplier.name,
        store: r.store.name, user: r.user.name,
        reason: r.reason, total: dec(r.total),
        lines: r.lines.map((l) => ({
          name: l.item.name, qty: dec(l.qty), unit: l.item.baseUnit.name,
          unitLabel: l.purchaseLine.unitLabel, factor: dec(l.purchaseLine.factor),
        })),
      }))
    )
  );
});

const schema = z.object({
  purchaseId: z.number().int(),
  reason: z.string().max(255).optional().nullable(),
  lines: z
    .array(z.object({ purchaseLineId: z.number().int(), qty: z.number().positive() }))
    .min(1, "Isi jumlah reject minimal untuk satu barang."),
});

/**
 * Posting a reject, atomically:
 *   1. checks every line against the invoice: no more than arrived, minus earlier rejects
 *   2. writes the reject document, valued at the purchase cost
 *   3. lowers stock with a REJECT movement per line (shows up in the kartu stok)
 */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "reject.manage");
  const body = schema.parse(await readJson(req));

  const doc = await prisma.$transaction(async (tx) => {
    // Lock the invoice before reading it, so two rejects of the same invoice
    // submitted at once cannot both pass the "already rejected" check.
    await tx.$queryRaw`SELECT id FROM \`Purchase\` WHERE id = ${body.purchaseId} FOR UPDATE`;

    const purchase = await tx.purchase.findFirst({
      where: { id: body.purchaseId, status: "POSTED" },
      include: {
        lines: {
          include: { item: { select: { name: true } }, rejectLines: { select: { qty: true } } },
        },
      },
    });
    if (!purchase) throw new Error("Faktur pembelian tidak ditemukan.");
    assertStoreAccess(user, purchase.storeId);

    const wanted = new Map<number, number>();
    for (const l of body.lines) wanted.set(l.purchaseLineId, (wanted.get(l.purchaseLineId) ?? 0) + l.qty);

    const lines = [...wanted].map(([purchaseLineId, qty]) => {
      const pl = purchase.lines.find((x) => x.id === purchaseLineId);
      if (!pl) throw new Error("Barang yang di-reject tidak ada di faktur ini.");
      const already = pl.rejectLines.reduce((a, r) => a + dec(r.qty), 0);
      const remaining = round4(dec(pl.baseQty) - already);
      if (qty > remaining) {
        throw new Error(`Reject ${pl.item.name} melebihi sisa yang bisa di-reject (${remaining}).`);
      }
      const unitCost = netUnitCost(pl);
      return { purchaseLineId, itemId: pl.itemId, qty, unitCost, total: round2(qty * unitCost) };
    });

    const seq = await nextSeq(tx, "reject");
    const created = await tx.reject.create({
      data: {
        code: docCode("RJ", seq),
        purchaseId: purchase.id, supplierId: purchase.supplierId,
        storeId: purchase.storeId, userId: user.id,
        reason: body.reason ?? null,
        total: round2(lines.reduce((a, l) => a + l.total, 0)),
        lines: { create: lines },
      },
    });

    for (const l of lines) {
      await assertStockAvailable(tx, l.itemId, purchase.storeId, l.qty);
      await applyMovement(tx, {
        itemId: l.itemId, storeId: purchase.storeId, qty: -l.qty,
        type: MovementType.REJECT, userId: user.id, unitCost: l.unitCost,
        refType: "Reject", refId: created.id,
        note: `Reject ${purchase.code}${body.reason ? ` · ${body.reason}` : ""}`.slice(0, 255),
      });
    }

    return created;
  });

  await audit(user.id, "create", "Reject", doc.id, {
    code: doc.code, purchaseId: body.purchaseId, lines: body.lines.length,
  });
  return ok(serialize({ id: doc.id, code: doc.code, total: dec(doc.total) }), 201);
});
