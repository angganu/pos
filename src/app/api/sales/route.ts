import { z } from "zod";
import { MovementType, PaymentMethod } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, fail, qp, qpInt, qpDate, audit, readJson, retryOnCodeClash } from "@/lib/api";
import { requirePerm, resolveStoreScope, assertStoreAccess } from "@/lib/rbac";
import { applyMovement, assertStockAvailable, currentCost, nextSeq } from "@/lib/stock";
import { round2, round4 } from "@/lib/units";
import { docCode } from "@/lib/format";

export const GET = route(async ({ user, req }) => {
  const { storeId, pinned } = resolveStoreScope(user, qpInt(req, "storeId"));
  const from = qpDate(req, "from");
  const to = qpDate(req, "to");
  const id = qpInt(req, "id");
  const q = qp(req).get("q")?.trim();
  const customerId = qpInt(req, "customerId");
  const itemId = qpInt(req, "itemId");

  if (id) {
    // Store-pinned users may only open receipts from their own store.
    const sale = await prisma.sale.findFirst({
      where: { id, ...(pinned && storeId ? { storeId } : {}) },
      include: {
        order: { select: { code: true } },
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
      ...(customerId ? { customerId } : {}),
      ...(itemId ? { lines: { some: { itemId } } } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q } }, { order: { code: { contains: q } } },
              { customer: { name: { contains: q } } }, { customer: { code: { contains: q } } },
            ],
          }
        : {}),
    },
    include: {
      order: { select: { code: true } },
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
        id: s.id, code: s.code, date: s.date, orderCode: s.order?.code ?? null,
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
  orderId: z.number().int(),
  shiftId: z.number().int().nullable().default(null),
  taxEnabled: z.boolean().default(true),
  taxRate: z.number().min(0).max(100).default(11),
  paymentMethod: z.enum(PaymentMethod).default("CASH"),
  paid: z.number().min(0).default(0),
  paymentMeta: z.record(z.string(), z.any()).optional().nullable(),
  lines: z
    .array(
      z.object({
        orderItemId: z.number().int(),
        /** What the customer received: at most what was ordered, 0 when none of it arrived. */
        qty: z.number().min(0),
        unitPrice: z.number().min(0),
        discount: z.number().min(0).default(0),
      })
    )
    .min(1, "PO tidak punya barang."),
});

/**
 * Posting the invoice of a delivered PO, atomically:
 *   1. checks each line against the PO: no more than was ordered, a new price needs price.manage
 *   2. checks stock, then lowers it by what was received and writes a StockMovement per line
 *   3. snapshots COGS so profit reports stay correct after future price changes
 *   4. awards loyalty points and marks the PO paid
 * What the customer did not receive came back on the truck, so it never leaves stock.
 */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "sale.create");
  const body = schema.parse(await readJson(req));
  if (new Set(body.lines.map((l) => l.orderItemId)).size !== body.lines.length) {
    throw new Error("Barang PO tercantum lebih dari sekali.");
  }

  const result = await retryOnCodeClash(() => prisma.$transaction(async (tx) => {
    // Lock the PO first, so two invoices of it submitted at once cannot both pass the status check.
    await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${body.orderId} FOR UPDATE`;

    const order = await tx.order.findUnique({
      where: { id: body.orderId },
      include: { items: { include: { item: { select: { name: true } } } } },
    });
    if (!order) throw new Error("PO tidak ditemukan.");
    assertStoreAccess(user, order.storeId);
    if (order.status === "PAID") throw new Error(`PO ${order.code} sudah dibuatkan invoice.`);
    if (order.status === "VOID") throw new Error(`PO ${order.code} sudah dibatalkan.`);
    if (!order.isDelivered) {
      throw new Error(`PO ${order.code} belum dikirim — invoice dibuat dari barang yang diterima pelanggan.`);
    }

    if (body.shiftId) {
      const shift = await tx.shift.findUnique({ where: { id: body.shiftId } });
      if (!shift || shift.userId !== user.id || shift.storeId !== order.storeId || shift.closedAt) {
        throw new Error("Shift tidak valid untuk transaksi ini.");
      }
    }

    const lines = [];
    let subtotal = 0;
    let lineDiscount = 0;
    let cogs = 0;
    let repriced = false;
    /** Total qty per item, so an item on two lines is checked against stock once. */
    const wanted = new Map<number, number>();

    for (const l of body.lines) {
      const ordered = order.items.find((x) => x.id === l.orderItemId);
      if (!ordered) throw new Error("Barang yang ditagih tidak ada di PO ini.");
      if (l.qty > dec(ordered.qty)) {
        throw new Error(`Qty ${ordered.item.name} melebihi yang dipesan (${dec(ordered.qty)}).`);
      }
      if (l.qty === 0) continue;
      if (l.unitPrice !== dec(ordered.unitPrice)) repriced = true;
      if (l.discount > round2(l.qty * l.unitPrice)) throw new Error("Diskon tidak boleh melebihi harga barang.");

      const unitCost = await currentCost(tx, ordered.itemId, order.storeId);
      subtotal += round2(l.qty * l.unitPrice);
      lineDiscount += l.discount;
      cogs += round2(l.qty * unitCost);
      wanted.set(ordered.itemId, round4((wanted.get(ordered.itemId) ?? 0) + l.qty));

      lines.push({
        itemId: ordered.itemId, qty: l.qty, unitPrice: l.unitPrice,
        basePrice: dec(ordered.basePrice), unitCost,
        discount: l.discount, total: round2(l.qty * l.unitPrice - l.discount), isMember: ordered.isMember,
      });
    }
    if (lines.length === 0) {
      throw new Error("Isi qty diterima minimal untuk satu barang. Bila tidak ada yang diterima, batalkan PO-nya.");
    }
    // Billing at another price than was ordered is a pricing decision, not a cashier one.
    if (repriced) requirePerm(user, "price.manage");

    for (const [itemId, qty] of wanted) await assertStockAvailable(tx, itemId, order.storeId, qty);

    subtotal = round2(subtotal);
    const taxable = round2(subtotal - lineDiscount);
    const tax = body.taxEnabled ? round2(taxable * (body.taxRate / 100)) : 0;
    const total = round2(taxable + tax);
    const paid = body.paid || total;
    const change = round2(Math.max(0, paid - total));

    const pointsPerRupiah = 1 / 1000;
    const pointsEarned = order.customerId ? Math.round(total * pointsPerRupiah) : 0;

    const seq = await nextSeq(tx, "sale");
    const sale = await tx.sale.create({
      data: {
        code: docCode("INV", seq), orderId: order.id,
        storeId: order.storeId, customerId: order.customerId,
        userId: user.id, shiftId: body.shiftId,
        subtotal, discount: lineDiscount, tax, total, cogs,
        paid, change, paymentMethod: body.paymentMethod,
        paymentMeta: body.paymentMeta ?? undefined,
        pointsEarned,
        lines: { create: lines },
      },
    });

    for (const l of lines) {
      await applyMovement(tx, {
        itemId: l.itemId, storeId: order.storeId, qty: -l.qty,
        type: MovementType.SALE, userId: user.id, unitCost: l.unitCost,
        refType: "Sale", refId: sale.id,
      });
    }

    if (order.customerId && pointsEarned > 0) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: { points: { increment: pointsEarned } },
      });
    }

    // Backs up the lock: a PO cancelled in the meantime is not invoiced.
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: "UNPAID" },
      data: { status: "PAID" },
    });
    if (count !== 1) throw new Error(`PO ${order.code} baru saja dibatalkan atau ditagih.`);

    return sale;
  }));

  await audit(user.id, "create", "Sale", result.id, {
    code: result.code, orderId: body.orderId, total: dec(result.total),
  });

  const receipt = await prisma.sale.findUniqueOrThrow({
    where: { id: result.id },
    include: {
      order: { select: { code: true } },
      store: true, customer: true, user: { select: { name: true } },
      lines: { include: { item: { include: { baseUnit: true } } } },
    },
  });

  return ok(
    serialize({
      id: receipt.id, code: receipt.code, date: receipt.date, orderCode: receipt.order?.code ?? null,
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
