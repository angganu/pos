import { Prisma, MovementType } from "@prisma/client";
import { dec } from "./db";
import { round4 } from "./units";

/**
 * The single place stock is allowed to change.
 *
 * Every call updates ItemStock AND writes a StockMovement row (the kartu stok),
 * so the ledger and the balance can never drift apart. Always run inside a
 * transaction alongside the document that caused the movement.
 */
export async function applyMovement(
  tx: Prisma.TransactionClient,
  args: {
    itemId: number;
    storeId: number;
    qty: number; // signed: positive = in, negative = out
    type: MovementType;
    userId?: number | null;
    unitCost?: number;
    refType?: string;
    refId?: number;
    note?: string;
  }
) {
  const { itemId, storeId, qty, type, userId, unitCost = 0, refType, refId, note } = args;

  const current = await tx.itemStock.upsert({
    where: { itemId_storeId: { itemId, storeId } },
    create: { itemId, storeId, stock: 0, minStock: 0 },
    update: {},
  });

  const balanceAfter = round4(dec(current.stock) + qty);

  await tx.itemStock.update({
    where: { itemId_storeId: { itemId, storeId } },
    data: { stock: balanceAfter },
  });

  await tx.stockMovement.create({
    data: { itemId, storeId, userId: userId ?? null, type, qty, balanceAfter, unitCost, refType, refId, note },
  });

  return balanceAfter;
}

/**
 * Throws when a store does not have enough stock to cover an outgoing qty.
 * `reserved` is stock already promised to open POs, so not free for this one.
 */
export async function assertStockAvailable(
  tx: Prisma.TransactionClient,
  itemId: number,
  storeId: number,
  needed: number,
  reserved = 0
) {
  const row = await tx.itemStock.findUnique({ where: { itemId_storeId: { itemId, storeId } } });
  const have = round4((row ? dec(row.stock) : 0) - reserved);
  if (have < needed) {
    const item = await tx.item.findUnique({ where: { id: itemId }, select: { name: true } });
    const held = reserved ? ` (${reserved} lagi sudah dipesan di PO lain)` : "";
    throw new Error(`Stok tidak cukup untuk ${item?.name ?? `#${itemId}`}: tersedia ${have}${held}, diminta ${needed}`);
  }
}

/**
 * Stock promised to open POs, per item: ordered but not invoiced yet. It is still
 * counted in ItemStock — stock only leaves with the invoice — but no longer free to order.
 */
export async function reservedQty(
  tx: Prisma.TransactionClient,
  storeId: number,
  itemIds: number[]
): Promise<Map<number, number>> {
  const rows = await tx.orderItem.groupBy({
    by: ["itemId"],
    where: { itemId: { in: itemIds }, order: { storeId, status: "UNPAID" } },
    _sum: { qty: true },
  });
  return new Map(rows.map((r) => [r.itemId, dec(r._sum.qty)]));
}

/**
 * Moving-average cost per base unit, derived from purchase history.
 * Used as COGS when a sale is posted, so profit reports are real.
 */
export async function currentCost(
  tx: Prisma.TransactionClient,
  itemId: number,
  storeId?: number
): Promise<number> {
  const lines = await tx.purchaseLine.findMany({
    where: { itemId, ...(storeId ? { purchase: { storeId } } : {}) },
    orderBy: { id: "desc" },
    take: 20,
    select: { pricePerBase: true, baseQty: true },
  });
  if (lines.length === 0) return 0;

  let qty = 0;
  let value = 0;
  for (const l of lines) {
    const q = dec(l.baseQty);
    qty += q;
    value += q * dec(l.pricePerBase);
  }
  return qty ? round4(value / qty) : dec(lines[0].pricePerBase);
}

/** Next sequential number for a document code within the current month. */
export async function nextSeq(
  tx: Prisma.TransactionClient,
  model: "purchase" | "order" | "sale" | "returnDoc" | "transfer" | "stockOpname" | "shift" | "reject"
): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  // @ts-expect-error dynamic model access is intentional here
  const count: number = await tx[model].count({ where: { createdAt: { gte: start } } });
  return count + 1;
}
