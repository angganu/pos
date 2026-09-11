import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, fail, qpInt } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { highestSellingPrice } from "@/lib/pricing";
import { round2 } from "@/lib/units";

/**
 * "Where is the same item cheapest, and what is the most I can sell it for?"
 *
 * Every supplier's offer is normalised to the item's BASE unit, so a 25 Kg sack
 * and a 1 Kg bag can be compared honestly.
 */
export const GET = route(async ({ user, req }) => {
  requirePerm(user, "supplier.compare");
  const itemId = qpInt(req, "itemId");

  if (!itemId) {
    // Overview: cheapest supplier for every item we buy.
    const lines = await prisma.purchaseLine.findMany({
      include: {
        item: { include: { baseUnit: true } },
        purchase: { include: { supplier: { select: { id: true, name: true } } } },
      },
      orderBy: { id: "desc" },
      take: 2000,
    });

    const best = new Map<number, { itemName: string; itemCode: string; unit: string; supplier: string; pricePerBase: number }>();
    for (const l of lines) {
      const ppb = dec(l.pricePerBase);
      const cur = best.get(l.itemId);
      if (!cur || ppb < cur.pricePerBase) {
        best.set(l.itemId, {
          itemName: l.item.name, itemCode: l.item.code,
          unit: l.item.baseUnit.name, supplier: l.purchase.supplier.name,
          pricePerBase: ppb,
        });
      }
    }

    return ok(
      serialize(
        [...best.entries()]
          .map(([id, v]) => ({ itemId: id, ...v }))
          .sort((a, b) => a.itemName.localeCompare(b.itemName))
      )
    );
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { baseUnit: true },
  });
  if (!item) return fail("Barang tidak ditemukan.", 404);

  // Latest offer from each supplier who has ever quoted this item.
  const lines = await prisma.purchaseLine.findMany({
    where: { itemId },
    include: { purchase: { include: { supplier: true } } },
    orderBy: { id: "desc" },
  });

  const latest = new Map<number, (typeof lines)[number]>();
  for (const l of lines) {
    if (!latest.has(l.purchase.supplierId)) latest.set(l.purchase.supplierId, l);
  }

  const offers = [...latest.values()]
    .map((l) => ({
      supplierId: l.purchase.supplierId,
      supplier: l.purchase.supplier.name,
      supplierCode: l.purchase.supplier.code,
      terms: l.purchase.supplier.terms,
      unitLabel: l.unitLabel,
      pricePerUnit: dec(l.pricePerUnit),
      pricePerBase: dec(l.pricePerBase),
      lastPurchase: l.purchase.date,
    }))
    .sort((a, b) => a.pricePerBase - b.pricePerBase);

  const cheapest = offers[0]?.pricePerBase ?? 0;

  // 30-day sales volume, to price the cost of buying from the wrong supplier.
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sold = await prisma.saleLine.aggregate({
    where: { itemId, sale: { date: { gte: since } } },
    _sum: { qty: true },
  });
  const monthlyQty = dec(sold._sum.qty ?? 0);

  const top = await highestSellingPrice(itemId);

  return ok(
    serialize({
      item: { id: item.id, code: item.code, name: item.name, unit: item.baseUnit.name },
      monthlyQty,
      offers: offers.map((o, i) => ({
        ...o,
        isCheapest: i === 0,
        deltaPerBase: round2(o.pricePerBase - cheapest),
        monthlyExtraCost: round2((o.pricePerBase - cheapest) * monthlyQty),
      })),
      highestSale: top
        ? {
            price: top.price, customer: top.customerName, store: top.storeName,
            marginVsCheapest: top.price ? (top.price - cheapest) / top.price : 0,
            spreadPerUnit: round2(top.price - cheapest),
          }
        : null,
    })
  );
});
