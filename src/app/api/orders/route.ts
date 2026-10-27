import { z } from "zod";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, fail, qp, qpInt, qpDate, audit, readJson, retryOnCodeClash } from "@/lib/api";
import { can, requirePerm, resolveStoreScope, assertStoreAccess } from "@/lib/rbac";
import { assertStockAvailable, nextSeq, reservedQty } from "@/lib/stock";
import { resolvePrices } from "@/lib/pricing";
import { round2, round4 } from "@/lib/units";
import { docCode } from "@/lib/format";

/** The surat jalan that carried a PO, and the trip it was on. */
const noteSelect = {
  id: true,
  code: true,
  delivery: { select: { id: true, code: true, date: true, vehicle: { select: { vehicleNo: true } } } },
} satisfies Prisma.DeliveryNoteSelect;

function toDelivery(n: Prisma.DeliveryNoteGetPayload<{ select: typeof noteSelect }> | null) {
  return n
    ? {
        id: n.delivery.id, code: n.delivery.code, date: n.delivery.date,
        noteId: n.id, noteCode: n.code, vehicleNo: n.delivery.vehicle.vehicleNo,
      }
    : null;
}

/**
 * GET /api/orders?id=                            -> one PO with its items, for the invoice screen
 * GET /api/orders?storeId=&status=&from=&to=&q=  -> PO list; status=UNPAID is what is still to invoice
 */
export const GET = route(async ({ user, req }) => {
  // POs serve the kasir and the invoice screen, and are a history report besides.
  if (!can(user, "sale.create")) requirePerm(user, "history.view");
  const { storeId, pinned } = resolveStoreScope(user, qpInt(req, "storeId"));
  const id = qpInt(req, "id");

  if (id) {
    // Store-pinned users may only open POs from their own store.
    const o = await prisma.order.findFirst({
      where: { id, ...(pinned && storeId ? { storeId } : {}) },
      include: {
        store: { select: { name: true, address: true, phone: true } },
        customer: { select: { id: true, code: true, name: true, address: true, phone: true } },
        user: { select: { name: true } },
        deliveryNote: { select: noteSelect },
        sale: { select: { id: true, code: true } },
        items: { include: { item: { select: { code: true, name: true, baseUnit: { select: { name: true } } } } } },
      },
    });
    if (!o) return fail("PO tidak ditemukan.", 404);
    return ok(
      serialize({
        id: o.id, code: o.code, date: o.date, status: o.status, isDelivered: o.isDelivered,
        subtotal: dec(o.subtotal), discount: dec(o.discount), tax: dec(o.tax), total: dec(o.total),
        store: o.store, customer: o.customer, createdBy: o.user.name,
        delivery: toDelivery(o.deliveryNote), invoice: o.sale,
        items: o.items.map((l) => ({
          id: l.id, itemId: l.itemId, code: l.item.code, name: l.item.name, unit: l.item.baseUnit.name,
          qty: dec(l.qty), unitPrice: dec(l.unitPrice), discount: dec(l.discount),
          total: dec(l.total), isMember: l.isMember,
        })),
      })
    );
  }

  const status = z.enum(OrderStatus).safeParse(qp(req).get("status")).data;
  const from = qpDate(req, "from");
  const to = qpDate(req, "to");
  const q = qp(req).get("q")?.trim();

  const orders = await prisma.order.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q } },
              { customer: { name: { contains: q } } },
              { customer: { code: { contains: q } } },
              { sale: { code: { contains: q } } },
            ],
          }
        : {}),
    },
    include: {
      store: { select: { code: true } },
      customer: { select: { name: true } },
      user: { select: { name: true } },
      deliveryNote: { select: noteSelect },
      sale: { select: { code: true } },
      _count: { select: { items: true } },
    },
    orderBy: { date: "desc" },
    take: 300,
  });

  return ok(
    serialize(
      orders.map((o) => ({
        id: o.id, code: o.code, date: o.date, storeCode: o.store.code,
        customer: o.customer?.name ?? "Pelanggan Umum", createdBy: o.user.name,
        lineCount: o._count.items, total: dec(o.total),
        status: o.status, isDelivered: o.isDelivered,
        delivery: toDelivery(o.deliveryNote), invoiceCode: o.sale?.code ?? null,
      }))
    )
  );
});

const schema = z.object({
  storeId: z.number().int(),
  customerId: z.number().int().nullable().default(null),
  taxEnabled: z.boolean().default(true),
  taxRate: z.number().min(0).max(100).default(11),
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
 * Taking a PO at the kasir, atomically:
 *   1. resolves each line's price for (item, store, customer)
 *   2. checks the stock not yet promised to other open POs covers it
 *   3. writes the PO, unpaid and waiting for a delivery
 * Stock, COGS and loyalty points wait for the invoice, made from what the customer receives.
 */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "sale.create");
  const body = schema.parse(await readJson(req));
  assertStoreAccess(user, body.storeId);

  // Overriding the resolved price is a pricing decision, not a cashier one.
  if (body.lines.some((l) => l.unitPrice !== undefined)) requirePerm(user, "price.manage");

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

  const result = await retryOnCodeClash(() => prisma.$transaction(async (tx) => {
    const seq = await nextSeq(tx, "order");

    const lines = [];
    let subtotal = 0;
    let lineDiscount = 0;
    /** Total qty per item, so an item on two lines is checked against stock once. */
    const wanted = new Map<number, number>();

    for (const l of body.lines) {
      const resolved = priceMap.get(l.itemId);
      const unitPrice = l.unitPrice ?? resolved?.price ?? 0;
      const basePrice = resolved?.basePrice ?? unitPrice;
      if (l.discount > round2(l.qty * unitPrice)) throw new Error("Diskon tidak boleh melebihi harga barang.");

      subtotal += round2(l.qty * unitPrice);
      lineDiscount += l.discount;
      wanted.set(l.itemId, round4((wanted.get(l.itemId) ?? 0) + l.qty));

      lines.push({
        itemId: l.itemId, qty: l.qty, unitPrice, basePrice,
        discount: l.discount, total: round2(l.qty * unitPrice - l.discount),
        isMember: resolved?.isMember ?? false,
      });
    }

    const reserved = await reservedQty(tx, body.storeId, [...wanted.keys()]);
    for (const [itemId, qty] of wanted) {
      await assertStockAvailable(tx, itemId, body.storeId, qty, reserved.get(itemId) ?? 0);
    }

    subtotal = round2(subtotal);
    const taxable = round2(subtotal - lineDiscount);
    const tax = body.taxEnabled ? round2(taxable * (body.taxRate / 100)) : 0;

    return tx.order.create({
      data: {
        code: docCode("PO", seq),
        storeId: body.storeId, customerId: body.customerId, userId: user.id,
        subtotal, discount: lineDiscount, tax, total: round2(taxable + tax),
        items: { create: lines },
      },
    });
  }));

  await audit(user.id, "create", "Order", result.id, { code: result.code, total: dec(result.total) });

  const slip = await prisma.order.findUniqueOrThrow({
    where: { id: result.id },
    include: {
      store: true, customer: true, user: { select: { name: true } },
      items: { include: { item: { include: { baseUnit: true } } } },
    },
  });

  return ok(
    serialize({
      id: slip.id, code: slip.code, date: slip.date,
      store: { name: slip.store.name, address: slip.store.address, phone: slip.store.phone },
      customer: slip.customer ? { name: slip.customer.name, code: slip.customer.code } : null,
      cashier: slip.user.name,
      subtotal: dec(slip.subtotal), discount: dec(slip.discount),
      tax: dec(slip.tax), total: dec(slip.total),
      lines: slip.items.map((l) => ({
        name: l.item.name, code: l.item.code, unit: l.item.baseUnit.name,
        qty: dec(l.qty), unitPrice: dec(l.unitPrice), discount: dec(l.discount),
        total: dec(l.total), isMember: l.isMember,
      })),
    }),
    201
  );
});

/**
 * Cancelling a PO, while it is unpaid. Nothing to undo: stock never moved for it.
 * A delivered one keeps its surat jalan, the record that the goods went out and came back.
 */
export const DELETE = route(async ({ user, req }) => {
  requirePerm(user, "sale.void");
  const id = qpInt(req, "id");
  if (!id) throw new Error("PO tidak valid.");

  const order = await prisma.order.findUnique({ where: { id }, select: { code: true, storeId: true } });
  if (!order) throw new Error("PO tidak ditemukan.");
  assertStoreAccess(user, order.storeId);

  // The status guard stops a cancel racing an invoice of the same PO.
  const { count } = await prisma.order.updateMany({
    where: { id, status: "UNPAID" },
    data: { status: "VOID" },
  });
  if (count !== 1) throw new Error(`PO ${order.code} sudah dibuatkan invoice atau sudah dibatalkan.`);

  await audit(user.id, "void", "Order", id, { code: order.code });
  return ok({ id });
});
