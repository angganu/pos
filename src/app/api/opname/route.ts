import { z } from "zod";
import { MovementType, DocStatus } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qpInt, audit } from "@/lib/api";
import { requirePerm, resolveStoreScope, assertStoreAccess } from "@/lib/rbac";
import { applyMovement, nextSeq } from "@/lib/stock";
import { round2, round4 } from "@/lib/units";
import { docCode } from "@/lib/format";

/** GET /api/opname?storeId= -> the count sheet: system qty vs blank physical qty */
export const GET = route(async ({ user, req }) => {
  requirePerm(user, "stock.adjust");
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  if (!storeId) throw new Error("Pilih satu toko untuk opname.");

  const [stocks, costs, history] = await Promise.all([
    prisma.itemStock.findMany({
      where: { storeId, item: { active: true } },
      include: { item: { include: { baseUnit: true } } },
      orderBy: { item: { name: "asc" } },
    }),
    prisma.purchaseLine.groupBy({ by: ["itemId"], _avg: { pricePerBase: true } }),
    prisma.stockOpname.findMany({
      where: { storeId },
      include: { user: { select: { name: true } }, _count: { select: { lines: true } } },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  const costMap = new Map(costs.map((c) => [c.itemId, dec(c._avg.pricePerBase ?? 0)]));

  return ok(
    serialize({
      sheet: stocks.map((s) => ({
        itemId: s.itemId, code: s.item.code, name: s.item.name,
        unit: s.item.baseUnit.name, systemQty: dec(s.stock),
        cost: costMap.get(s.itemId) ?? 0,
      })),
      history: history.map((h) => ({
        id: h.id, code: h.code, date: h.date, status: h.status,
        user: h.user.name, lineCount: h._count.lines,
      })),
    })
  );
});

const schema = z.object({
  storeId: z.number().int(),
  note: z.string().max(255).optional().nullable(),
  /** Only send counted rows; anything omitted is left untouched. */
  lines: z
    .array(z.object({ itemId: z.number().int(), physicalQty: z.number().min(0) }))
    .min(1, "Belum ada barang yang dihitung."),
});

/** Posting an opname writes ADJUSTMENT movements for every discrepancy. */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "stock.adjust");
  const body = schema.parse(await req.json());
  assertStoreAccess(user, body.storeId);

  const doc = await prisma.$transaction(async (tx) => {
    const seq = await nextSeq(tx, "stockOpname");

    const costs = await tx.purchaseLine.groupBy({ by: ["itemId"], _avg: { pricePerBase: true } });
    const costMap = new Map(costs.map((c) => [c.itemId, dec(c._avg.pricePerBase ?? 0)]));

    const created = await tx.stockOpname.create({
      data: {
        code: docCode("SO", seq), storeId: body.storeId, userId: user.id,
        status: DocStatus.POSTED, note: body.note ?? null,
      },
    });

    for (const l of body.lines) {
      const row = await tx.itemStock.findUnique({
        where: { itemId_storeId: { itemId: l.itemId, storeId: body.storeId } },
      });
      const systemQty = row ? dec(row.stock) : 0;
      const diff = round4(l.physicalQty - systemQty);
      const cost = costMap.get(l.itemId) ?? 0;

      await tx.opnameLine.create({
        data: {
          opnameId: created.id, itemId: l.itemId,
          systemQty, physicalQty: l.physicalQty, diff,
          value: round2(Math.abs(diff) * cost),
        },
      });

      if (diff !== 0) {
        await applyMovement(tx, {
          itemId: l.itemId, storeId: body.storeId, qty: diff,
          type: MovementType.ADJUSTMENT, userId: user.id, unitCost: cost,
          refType: "StockOpname", refId: created.id,
          note: `Opname: sistem ${systemQty} → fisik ${l.physicalQty}`,
        });
      }
    }

    return created;
  });

  await audit(user.id, "create", "StockOpname", doc.id, { code: doc.code, lines: body.lines.length });
  return ok(serialize({ id: doc.id, code: doc.code }), 201);
});
