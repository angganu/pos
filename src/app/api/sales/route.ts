import { z } from "zod";
import { MovementType, PaymentMethod } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, fail, qpInt, qpDate, audit } from "@/lib/api";
import { requirePerm, resolveStoreScope, assertStoreAccess } from "@/lib/rbac";
import { applyMovement, assertStockAvailable, currentCost, nextSeq } from "@/lib/stock";
import { resolvePrices } from "@/lib/pricing";
import { round2 } from "@/lib/units";

export const GET = route(async ({ user, req }) => {
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));
  const from = qpDate(req, "from");
  const to = qpDate(req, "to");
  const id = qpInt(req, "id");

  if (id) {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        store: true, customer: true, user: { select: { name: true } },
        lines: { include: { item: { include: { baseUnit: true } } } },
      },
    });
    if (!sale) return fail("Transaksi tidak ditemukan.", 404);
    return ok(
      serialize({
        ...sale,
        subtotal: dec(sale.subtotal), discount: dec(sale.discount),
        tax: dec(sale.tax), total: dec(sale.total),
        paid: dec(sale.paid), change: dec(sale.change),
        lines: sale.lines.map((l) => ({
          id: l.id, itemName: l.item.name, itemCode: l.item.code,
          unit: l.item.baseUnit.name, qty: dec(l.qty),
          unitPrice: dec(l.unitPrice), discount: dec(l.discount),
          total: dec(l.total), isMember: l.isMember,
        })),
      })
    );
  }

  const sales = await prisma.sale.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    include: {
      store: { select: { code: true, name: true } },
      customer: { select: { code: true, name: true, tier: true } },
      user: { select: { name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  return ok(
    serialize(
      sales.map((s) => ({
        id: s.id, code: s.code, date: s.date,
        store: s.store.name, storeCode: s.store.code,
        customer: s.customer?.name ?? "Pelanggan Umum",
        customerTier: s.customer?.tier ?? null,
        cashier: s.user.name, lineCount: s._count.lines,
        subtotal: dec(s.subtotal), discount: dec(s.discount),
        tax: dec(s.tax), total: dec(s.total),
        paymentMethod: s.paymentMethod, status: s.status,
      }))
    )
  );
});

const schema = z.object({
  storeId: z.number().int(),
  customerId: z.number().int().nullable().default(null),
  shiftId: z.number().int().nullable().default(null),
  taxEnabled: z.boolean().default(true),
  taxRate: z.number().min(0).max(100).default(11),
  paymentMethod: z.nativeEnum(PaymentMethod).default("CASH"),
  paid: z.number().min(0).default(0),
  paymentMeta: z.record(z.any()).optional().nullable(),
  lines: z
    .array(
      z.object({
        itemId: z.number().int(),
        qty: z.number().positive("Jumlah harus lebih dari 0"),
        discount: z.number().min(0).default(0),
        /** Optional manual override; otherwise the resolved price wins. */
        unitPrice: z.number().min(0).optional(),
      })
    )
    .min(1, "Keranjang kosong."),
});

/**
 * Posting a sale, atomically:
 *   1. resolves each line's price for (item, store, customer)
 *   2. checks stock, then lowers it and writes a StockMovement per line
 *   3. snapshots COGS so profit reports stay correct after future price changes
 *   4. awards loyalty points
 */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "sale.create");
  const body = schema.parse(await req.json());
  assertStoreAccess(user, body.storeId);

  const priceMap = await resolvePrices(
    body.lines.map((l) => l.itemId),
    body.storeId,
    body.customerId
  );

  const missing = body.lines.filter((l) => {
    const p = priceMap.get(l.itemId);
    return l.unitPrice === undefined && (!p || p.source === "none");
  });
  if (missing.length) {
    return fail(`Harga belum diatur untuk ${missing.length} barang di toko ini.`, 422);
  }

  const result = await prisma.$transaction(async (tx) => {
    const seq = await nextSeq(tx, "sale");

    const lines = [];
    let subtotal = 0;
    let lineDiscount = 0;
    let cogs = 0;

    for (const l of body.lines) {
      const resolved = priceMap.get(l.itemId);
      const unitPrice = l.unitPrice ?? resolved?.price ?? 0;
      const basePrice = resolved?.basePrice ?? unitPrice;
      const total = round2(l.qty * unitPrice - l.discount);
      const unitCost = await currentCost(tx, l.itemId, body.storeId);

      await assertStockAvailable(tx, l.itemId, body.storeId, l.qty);

      subtotal += round2(l.qty * unitPrice);
      lineDiscount += l.discount;
      cogs += round2(l.qty * unitCost);

      lines.push({
        itemId: l.itemId, qty: l.qty, unitPrice, basePrice, unitCost,
        discount: l.discount, total, isMember: resolved?.isMember ?? false,
      });
    }

    subtotal = round2(subtotal);
    const taxable = round2(subtotal - lineDiscount);
    const tax = body.taxEnabled ? round2(taxable * (body.taxRate / 100)) : 0;
    const total = round2(taxable + tax);
    const paid = body.paid || total;
    const change = round2(Math.max(0, paid - total));

    const pointsPerRupiah = 1 / 1000;
    const pointsEarned = body.customerId ? Math.round(total * pointsPerRupiah) : 0;

    const sale = await tx.sale.create({
      data: {
        code: `TRX-${String(Date.now()).slice(-6)}${String(seq).padStart(3, "0")}`,
        storeId: body.storeId, customerId: body.customerId,
        userId: user.id, shiftId: body.shiftId,
        subtotal, discount: lineDiscount, tax, total, cogs,
        paid, change, paymentMethod: body.paymentMethod,
        paymentMeta: body.paymentMeta ?? undefined,
        pointsEarned,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    for (const l of lines) {
      await applyMovement(tx, {
        itemId: l.itemId, storeId: body.storeId, qty: -l.qty,
        type: MovementType.SALE, userId: user.id, unitCost: l.unitCost,
        refType: "Sale", refId: sale.id,
      });
    }

    if (body.customerId && pointsEarned > 0) {
      await tx.customer.update({
        where: { id: body.customerId },
        data: { points: { increment: pointsEarned } },
      });
    }

    return sale;
  });

  await audit(user.id, "create", "Sale", result.id, { code: result.code, total: dec(result.total) });

  const receipt = await prisma.sale.findUniqueOrThrow({
    where: { id: result.id },
    include: {
      store: true, customer: true, user: { select: { name: true } },
      lines: { include: { item: { include: { baseUnit: true } } } },
    },
  });

  return ok(
    serialize({
      id: receipt.id, code: receipt.code, date: receipt.date,
      store: { name: receipt.store.name, address: receipt.store.address, phone: receipt.store.phone },
      customer: receipt.customer ? { name: receipt.customer.name, code: receipt.customer.code, points: receipt.customer.points } : null,
      cashier: receipt.user.name,
      subtotal: dec(receipt.subtotal), discount: dec(receipt.discount),
      tax: dec(receipt.tax), total: dec(receipt.total),
      paid: dec(receipt.paid), change: dec(receipt.change),
      paymentMethod: receipt.paymentMethod, pointsEarned: receipt.pointsEarned,
      lines: receipt.lines.map((l) => ({
        name: l.item.name, code: l.item.code, unit: l.item.baseUnit.name,
        qty: dec(l.qty), unitPrice: dec(l.unitPrice), discount: dec(l.discount),
        total: dec(l.total), isMember: l.isMember,
      })),
    }),
    201
  );
});
