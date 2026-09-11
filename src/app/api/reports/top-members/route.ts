import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qpInt, qpDate } from "@/lib/api";
import { requirePerm, resolveStoreScope } from "@/lib/rbac";
import { round2 } from "@/lib/units";

/** Who spends the most, and which items move the most volume. */
export const GET = route(async ({ user, req }) => {
  requirePerm(user, "report.view");
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  const to = qpDate(req, "to") ?? new Date();
  const from =
    qpDate(req, "from") ??
    (() => {
      const d = new Date(to);
      d.setMonth(d.getMonth() - 5);
      return d;
    })();

  const where = {
    status: "POSTED" as const,
    date: { gte: from, lte: to },
    ...(storeId ? { storeId } : {}),
  };

  const [grouped, customers, topItems] = await Promise.all([
    prisma.sale.groupBy({
      by: ["customerId"],
      where: { ...where, customerId: { not: null } },
      _sum: { total: true },
      _count: { _all: true },
      _max: { date: true },
      orderBy: { _sum: { total: "desc" } },
      take: 25,
    }),
    prisma.customer.findMany({ where: { active: true } }),
    prisma.saleLine.groupBy({
      by: ["itemId"],
      where: { sale: where },
      _sum: { qty: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 15,
    }),
  ]);

  const custMap = new Map(customers.map((c) => [c.id, c]));
  const items = await prisma.item.findMany({
    where: { id: { in: topItems.map((t) => t.itemId) } },
    include: { baseUnit: true },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  return ok(
    serialize({
      members: grouped.map((g, i) => {
        const c = custMap.get(g.customerId!);
        const spend = dec(g._sum.total ?? 0);
        return {
          rank: i + 1,
          customerId: g.customerId,
          code: c?.code ?? "—",
          name: c?.name ?? "—",
          tier: c?.tier ?? "—",
          points: c?.points ?? 0,
          txCount: g._count._all,
          totalSpend: round2(spend),
          avgSpend: g._count._all ? round2(spend / g._count._all) : 0,
          lastPurchase: g._max.date,
        };
      }),
      topItems: topItems.map((t, i) => {
        const it = itemMap.get(t.itemId);
        return {
          rank: i + 1, itemId: t.itemId,
          name: it?.name ?? "—", code: it?.code ?? "—",
          unit: it?.baseUnit.name ?? "",
          qty: dec(t._sum.qty ?? 0),
          revenue: round2(dec(t._sum.total ?? 0)),
        };
      }),
    })
  );
});
