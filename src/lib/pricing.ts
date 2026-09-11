import { prisma, dec } from "./db";

/**
 * Price resolution.
 *
 * An item's price is a function of (item, store, customer):
 *   1. special price for THIS member in THIS store  -> ItemPrice(customerId = member)
 *   2. general price for THIS store                 -> ItemPrice(customerId = null)
 *   3. no price configured                          -> 0 (caller should block the sale)
 *
 * A member shopping in a different store therefore pays that store's member
 * price, and falls back to that store's general price when none is set.
 */

export type ResolvedPrice = {
  itemId: number;
  price: number;
  basePrice: number;
  isMember: boolean;
  source: "member" | "store" | "none";
};

export async function resolvePrice(
  itemId: number,
  storeId: number,
  customerId?: number | null
): Promise<ResolvedPrice> {
  const rows = await prisma.itemPrice.findMany({
    where: {
      itemId,
      storeId,
      OR: [{ customerId: null }, ...(customerId ? [{ customerId }] : [])],
    },
  });

  const general = rows.find((r) => r.customerId === null);
  const member = customerId ? rows.find((r) => r.customerId === customerId) : undefined;
  const basePrice = general ? dec(general.price) : 0;

  if (member) {
    return { itemId, price: dec(member.price), basePrice, isMember: true, source: "member" };
  }
  if (general) {
    return { itemId, price: basePrice, basePrice, isMember: false, source: "store" };
  }
  return { itemId, price: 0, basePrice: 0, isMember: false, source: "none" };
}

/** Batch version — one query for a whole cart. */
export async function resolvePrices(
  itemIds: number[],
  storeId: number,
  customerId?: number | null
): Promise<Map<number, ResolvedPrice>> {
  if (itemIds.length === 0) return new Map();

  const rows = await prisma.itemPrice.findMany({
    where: {
      itemId: { in: itemIds },
      storeId,
      OR: [{ customerId: null }, ...(customerId ? [{ customerId }] : [])],
    },
  });

  const out = new Map<number, ResolvedPrice>();
  for (const itemId of itemIds) {
    const mine = rows.filter((r) => r.itemId === itemId);
    const general = mine.find((r) => r.customerId === null);
    const member = customerId ? mine.find((r) => r.customerId === customerId) : undefined;
    const basePrice = general ? dec(general.price) : 0;

    if (member) {
      out.set(itemId, { itemId, price: dec(member.price), basePrice, isMember: true, source: "member" });
    } else if (general) {
      out.set(itemId, { itemId, price: basePrice, basePrice, isMember: false, source: "store" });
    } else {
      out.set(itemId, { itemId, price: 0, basePrice: 0, isMember: false, source: "none" });
    }
  }
  return out;
}

/** Upsert a general or member price. customerId null = general price. */
export async function setPrice(
  itemId: number,
  storeId: number,
  customerId: number | null,
  price: number
) {
  const existing = await prisma.itemPrice.findFirst({ where: { itemId, storeId, customerId } });
  if (existing) {
    return prisma.itemPrice.update({ where: { id: existing.id }, data: { price } });
  }
  return prisma.itemPrice.create({ data: { itemId, storeId, customerId, price } });
}

export async function clearPrice(itemId: number, storeId: number, customerId: number | null) {
  const existing = await prisma.itemPrice.findFirst({ where: { itemId, storeId, customerId } });
  if (existing) await prisma.itemPrice.delete({ where: { id: existing.id } });
}

/**
 * The highest price this item can be sold at, across every store and member —
 * powers the "harga jual tertinggi" card on the supplier-comparison screen.
 */
export async function highestSellingPrice(itemId: number) {
  const rows = await prisma.itemPrice.findMany({
    where: { itemId },
    include: { store: true, customer: true },
    orderBy: { price: "desc" },
    take: 1,
  });
  const top = rows[0];
  if (!top) return null;
  return {
    price: dec(top.price),
    storeName: top.store.name,
    customerName: top.customer?.name ?? "Pelanggan umum",
  };
}
