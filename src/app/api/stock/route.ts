import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qp, qpInt } from "@/lib/api";
import { resolveStoreScope } from "@/lib/rbac";

/**
 * GET /api/stock?storeId=&q=&lowOnly=1   -> stock per item across stores
 * GET /api/stock?itemId=&storeId=&card=1 -> kartu stok (movement ledger)
 */
export const GET = route(async ({ user, req }) => {
  const params = qp(req);
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  const itemId = qpInt(req, "itemId");

  if (params.get("card") === "1" && itemId) {
    const movements = await prisma.stockMovement.findMany({
      where: { itemId, ...(storeId ? { storeId } : {}) },
      include: {
        store: { select: { code: true, name: true } },
        user: { select: { name: true } },
        item: { select: { name: true, code: true, baseUnit: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return ok(
      serialize(
        movements.map((m) => ({
          id: m.id, date: m.createdAt, type: m.type,
          qty: dec(m.qty), balanceAfter: dec(m.balanceAfter), unitCost: dec(m.unitCost),
          refType: m.refType, refId: m.refId, note: m.note,
          storeCode: m.store.code, userName: m.user?.name ?? "Sistem",
          itemName: m.item.name, unit: m.item.baseUnit.name,
        }))
      )
    );
  }

  const q = params.get("q")?.trim() ?? "";
  const stores = await prisma.store.findMany({
    where: { active: true, ...(storeId ? { id: storeId } : {}) },
    orderBy: { code: "asc" },
  });

  const items = await prisma.item.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }] } : {}),
    },
    include: { baseUnit: true, stocks: true },
    orderBy: { name: "asc" },
  });

  // Latest cost per item, for stock valuation.
  const costs = await prisma.purchaseLine.groupBy({
    by: ["itemId"],
    _avg: { pricePerBase: true },
  });
  const costMap = new Map(costs.map((c) => [c.itemId, dec(c._avg.pricePerBase ?? 0)]));

  const rows = items.map((it) => {
    const perStore = stores.map((s) => {
      const row = it.stocks.find((x) => x.storeId === s.id);
      const stock = row ? dec(row.stock) : 0;
      const minStock = row ? dec(row.minStock) : 0;
      return { storeId: s.id, storeCode: s.code, storeName: s.name, stock, minStock, low: stock < minStock };
    });
    const total = perStore.reduce((a, s) => a + s.stock, 0);
    const cost = costMap.get(it.id) ?? 0;
    return {
      id: it.id, code: it.code, name: it.name, unit: it.baseUnit.name,
      unitCode: it.baseUnit.code, perStore, total, cost, value: total * cost,
      low: perStore.some((s) => s.low),
    };
  });

  const lowOnly = params.get("lowOnly") === "1";
  const filtered = lowOnly ? rows.filter((r) => r.low) : rows;

  return ok(
    serialize({
      stores: stores.map((s) => ({ id: s.id, code: s.code, name: s.name })),
      rows: filtered,
      totals: {
        value: rows.reduce((a, r) => a + r.value, 0),
        lowCount: rows.filter((r) => r.low).length,
        itemCount: rows.length,
      },
    })
  );
});
