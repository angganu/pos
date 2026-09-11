import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qpInt, qpDate } from "@/lib/api";
import { requirePerm, resolveStoreScope } from "@/lib/rbac";
import { round2 } from "@/lib/units";

/**
 * The owner's accounting view:
 *   - what we bought for, what we sold for, and the profit, per ITEM
 *   - profit per STORE
 *   - profit per PERIOD (monthly trend)
 *   - KPI headline figures
 *
 * COGS is read from the snapshot taken when each sale was posted, so later
 * price changes never rewrite history.
 */
export const GET = route(async ({ user, req }) => {
  requirePerm(user, "report.view");
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));

  const to = qpDate(req, "to") ?? new Date();
  const from =
    qpDate(req, "from") ??
    (() => {
      const d = new Date(to);
      d.setMonth(d.getMonth() - 5);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

  const where = {
    status: "POSTED" as const,
    date: { gte: from, lte: to },
    ...(storeId ? { storeId } : {}),
  };

  const [sales, stores] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        lines: { include: { item: { include: { baseUnit: true } } } },
        store: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.store.findMany({
      where: { active: true, ...(storeId ? { id: storeId } : {}) },
      orderBy: { code: "asc" },
    }),
  ]);

  // ---- KPI ----
  let revenue = 0;
  let cogs = 0;
  let qtySold = 0;
  for (const s of sales) {
    revenue += dec(s.subtotal) - dec(s.discount);
    cogs += dec(s.cogs);
    for (const l of s.lines) qtySold += dec(l.qty);
  }
  const profit = round2(revenue - cogs);

  // ---- per store ----
  const byStore = new Map<number, { revenue: number; cogs: number; tx: number }>();
  for (const s of sales) {
    const cur = byStore.get(s.storeId) ?? { revenue: 0, cogs: 0, tx: 0 };
    cur.revenue += dec(s.subtotal) - dec(s.discount);
    cur.cogs += dec(s.cogs);
    cur.tx += 1;
    byStore.set(s.storeId, cur);
  }
  const storeRows = stores.map((st) => {
    const v = byStore.get(st.id) ?? { revenue: 0, cogs: 0, tx: 0 };
    const p = round2(v.revenue - v.cogs);
    return {
      storeId: st.id, code: st.code, name: st.name,
      revenue: round2(v.revenue), cogs: round2(v.cogs), profit: p,
      margin: v.revenue ? p / v.revenue : 0, txCount: v.tx,
    };
  });

  // ---- per item ----
  type Agg = { name: string; code: string; unit: string; qty: number; revenue: number; cogs: number };
  const byItem = new Map<number, Agg>();
  for (const s of sales) {
    for (const l of s.lines) {
      const cur =
        byItem.get(l.itemId) ??
        { name: l.item.name, code: l.item.code, unit: l.item.baseUnit.name, qty: 0, revenue: 0, cogs: 0 };
      cur.qty += dec(l.qty);
      cur.revenue += dec(l.total);
      cur.cogs += dec(l.qty) * dec(l.unitCost);
      byItem.set(l.itemId, cur);
    }
  }
  const itemRows = [...byItem.entries()]
    .map(([id, v]) => {
      const p = round2(v.revenue - v.cogs);
      return {
        itemId: id, name: v.name, code: v.code, unit: v.unit,
        qty: v.qty, revenue: round2(v.revenue), cogs: round2(v.cogs),
        profit: p, margin: v.revenue ? p / v.revenue : 0,
        avgSellPrice: v.qty ? round2(v.revenue / v.qty) : 0,
        avgBuyPrice: v.qty ? round2(v.cogs / v.qty) : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  // ---- per period (month) ----
  const byMonth = new Map<string, { revenue: number; cogs: number }>();
  for (const s of sales) {
    const key = `${s.date.getFullYear()}-${String(s.date.getMonth() + 1).padStart(2, "0")}`;
    const cur = byMonth.get(key) ?? { revenue: 0, cogs: 0 };
    cur.revenue += dec(s.subtotal) - dec(s.discount);
    cur.cogs += dec(s.cogs);
    byMonth.set(key, cur);
  }
  const MONTH_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const periodRows = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [y, m] = key.split("-");
      return {
        key, label: `${MONTH_ID[Number(m) - 1]} ${y.slice(2)}`,
        revenue: round2(v.revenue), cogs: round2(v.cogs),
        profit: round2(v.revenue - v.cogs),
      };
    });

  return ok(
    serialize({
      range: { from, to },
      kpi: {
        revenue: round2(revenue), cogs: round2(cogs), profit,
        margin: revenue ? profit / revenue : 0,
        txCount: sales.length,
        avgTicket: sales.length ? round2(revenue / sales.length) : 0,
        qtySold,
      },
      stores: storeRows,
      items: itemRows,
      periods: periodRows,
    })
  );
});
