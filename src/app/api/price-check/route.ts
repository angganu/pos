import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qp, qpInt } from "@/lib/api";

/**
 * Price check — look up one item's price in EVERY store, plus the highest
 * member price, without touching the cart.
 */
export const GET = route(async ({ req }) => {
  const q = qp(req).get("q")?.trim() ?? "";
  const customerId = qpInt(req, "customerId");

  const items = await prisma.item.findMany({
    where: {
      active: true,
      ...(q
        ? { OR: [{ name: { contains: q } }, { code: { contains: q } }, { barcode: { contains: q } }] }
        : {}),
    },
    include: {
      baseUnit: true,
      prices: { include: { store: { select: { id: true, code: true, name: true } } } },
      stocks: true,
    },
    orderBy: { name: "asc" },
    take: 25,
  });

  const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { code: "asc" } });

  return ok(
    serialize({
      stores: stores.map((s) => ({ id: s.id, code: s.code, name: s.name })),
      rows: items.map((it) => {
        const general = new Map<number, number>();
        const forCustomer = new Map<number, number>();
        let highest = 0;
        let highestStore = "";

        for (const p of it.prices) {
          const value = dec(p.price);
          if (p.customerId === null) general.set(p.storeId, value);
          if (customerId && p.customerId === customerId) forCustomer.set(p.storeId, value);
          if (value > highest) {
            highest = value;
            highestStore = p.store.name;
          }
        }

        return {
          itemId: it.id, code: it.code, name: it.name, unit: it.baseUnit.name,
          perStore: stores.map((s) => ({
            storeId: s.id, storeCode: s.code,
            price: forCustomer.get(s.id) ?? general.get(s.id) ?? 0,
            generalPrice: general.get(s.id) ?? 0,
            isMemberPrice: forCustomer.has(s.id),
            stock: dec(it.stocks.find((x) => x.storeId === s.id)?.stock ?? 0),
          })),
          highestPrice: highest,
          highestStore,
        };
      }),
    })
  );
});
