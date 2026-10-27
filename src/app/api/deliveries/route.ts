import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, fail, qp, qpInt, qpDate, audit, readJson, retryOnCodeClash } from "@/lib/api";
import { can, requirePerm, resolveStoreScope, assertStoreAccess } from "@/lib/rbac";
import { docCode } from "@/lib/format";
import { noteKey } from "@/lib/delivery";

const lineSelect = {
  itemId: true,
  qty: true,
  item: { select: { code: true, name: true, baseUnit: { select: { name: true } } } },
} satisfies Prisma.OrderItemSelect;

function toLine(l: Prisma.OrderItemGetPayload<{ select: typeof lineSelect }>) {
  return { itemId: l.itemId, code: l.item.code, name: l.item.name, unit: l.item.baseUnit.name, qty: dec(l.qty) };
}

const customerSelect = {
  id: true, code: true, name: true, address: true, phone: true,
} satisfies Prisma.CustomerSelect;

/**
 * GET /api/deliveries?pending=1&storeId=     -> one store's POs still waiting to be delivered
 * GET /api/deliveries?id=                    -> one delivery with every surat jalan, for printing
 * GET /api/deliveries?storeId=&from=&to=&q=  -> delivery history (from/to on the delivery date)
 */
export const GET = route(async ({ user, req }) => {
  const pending = qp(req).get("pending") === "1";
  // The waiting list serves the pengiriman screen; history and printing are reports,
  // open to whoever reads histories and to whoever makes the deliveries.
  if (pending) requirePerm(user, "delivery.manage");
  else if (!can(user, "delivery.manage")) requirePerm(user, "history.view");
  const { storeId, pinned } = resolveStoreScope(user, qpInt(req, "storeId"));
  const id = qpInt(req, "id");

  if (pending) {
    if (!storeId) return fail("Pilih satu toko untuk melihat PO yang belum dikirim.", 400);
    // Not only unpaid ones: sales paid at the kasir before POs existed still await their delivery.
    const orders = await prisma.order.findMany({
      where: { storeId, status: { not: "VOID" }, isDelivered: false },
      include: { customer: { select: customerSelect }, items: { select: lineSelect } },
      orderBy: { date: "asc" },
      take: 300,
    });
    return ok(
      serialize(
        orders.map((o) => ({
          id: o.id, code: o.code, date: o.date, total: dec(o.total),
          customer: o.customer, lines: o.items.map(toLine),
        }))
      )
    );
  }

  if (id) {
    // Store-pinned users may only open deliveries from their own store.
    const d = await prisma.delivery.findFirst({
      where: { id, ...(pinned && storeId ? { storeId } : {}) },
      include: {
        store: { select: { name: true, address: true, phone: true } },
        vehicle: { select: { vehicleNo: true, vehicleType: true } },
        user: { select: { name: true } },
        notes: {
          orderBy: { code: "asc" },
          include: {
            customer: { select: customerSelect },
            orders: {
              orderBy: { date: "asc" },
              include: { user: { select: { name: true } }, items: { select: lineSelect } },
            },
          },
        },
      },
    });
    if (!d) return fail("Pengiriman tidak ditemukan.", 404);
    return ok(
      serialize({
        id: d.id, code: d.code, date: d.date, note: d.note, createdBy: d.user.name,
        store: d.store, vehicle: d.vehicle, driver: d.driver, driverAssistance: d.driverAssistance,
        notes: d.notes.map((n) => ({
          id: n.id, code: n.code, customer: n.customer,
          orders: n.orders.map((o) => ({
            id: o.id, code: o.code, date: o.date, createdBy: o.user.name, lines: o.items.map(toLine),
          })),
        })),
      })
    );
  }

  const from = qpDate(req, "from");
  const to = qpDate(req, "to");
  const q = qp(req).get("q")?.trim();

  const deliveries = await prisma.delivery.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q } },
              { driver: { contains: q } },
              { vehicle: { vehicleNo: { contains: q } } },
              {
                notes: {
                  some: {
                    OR: [
                      { code: { contains: q } },
                      { customer: { name: { contains: q } } },
                      { orders: { some: { code: { contains: q } } } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      store: { select: { name: true } },
      vehicle: { select: { vehicleNo: true, vehicleType: true } },
      user: { select: { name: true } },
      notes: {
        orderBy: { code: "asc" },
        include: {
          customer: { select: { name: true } },
          orders: { select: { code: true, status: true }, orderBy: { date: "asc" } },
        },
      },
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return ok(
    serialize(
      deliveries.map((d) => ({
        id: d.id, code: d.code, date: d.date, store: d.store.name, createdBy: d.user.name,
        vehicleNo: d.vehicle.vehicleNo, vehicleType: d.vehicle.vehicleType, driver: d.driver,
        // Once a PO on it is invoiced, the trip is part of a fixed transaction.
        invoiced: d.notes.some((n) => n.orders.some((o) => o.status === "PAID")),
        notes: d.notes.map((n) => ({
          id: n.id, code: n.code, customer: n.customer?.name ?? "Pelanggan Umum",
          orders: n.orders.map((o) => o.code),
        })),
      }))
    )
  );
});

/**
 * Highest number this month's codes with this prefix have reached. Counting rows,
 * as nextSeq does, would hand a cancelled delivery's code out a second time.
 */
async function lastSeq(tx: Prisma.TransactionClient, prefix: "PG" | "SJ"): Promise<number> {
  const head = docCode(prefix, 0).slice(0, -4);
  const query = {
    where: { code: { startsWith: head } },
    orderBy: { code: "desc" as const },
    select: { code: true },
  };
  const last = prefix === "PG" ? await tx.delivery.findFirst(query) : await tx.deliveryNote.findFirst(query);
  return last ? Number(last.code.slice(head.length)) || 0 : 0;
}

const schema = z.object({
  orderIds: z.array(z.number().int()).min(1, "Pilih minimal satu PO."),
  vehicleId: z.number().int(),
  date: z.iso.date().transform((s) => new Date(s)),
  note: z.string().trim().max(255).optional().nullable(),
});

/**
 * Posting a delivery, atomically:
 *   1. checks every PO: one store, not cancelled, not delivered yet
 *   2. writes the delivery and one surat jalan per customer
 *   3. marks the POs delivered and links each to its surat jalan
 */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "delivery.manage");
  const body = schema.parse(await readJson(req));
  const orderIds = [...new Set(body.orderIds)];

  const result = await retryOnCodeClash(() => prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findFirst({ where: { id: body.vehicleId, active: true } });
    if (!vehicle) throw new Error("Kendaraan tidak ditemukan atau sudah nonaktif.");

    const orders = await tx.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, code: true, storeId: true, customerId: true, status: true, isDelivered: true },
      orderBy: { date: "asc" },
    });
    if (orders.length !== orderIds.length) throw new Error("Sebagian PO tidak ditemukan.");
    const storeId = orders[0].storeId;
    if (orders.some((o) => o.storeId !== storeId)) {
      throw new Error("Satu pengiriman hanya untuk PO dari satu toko.");
    }
    assertStoreAccess(user, storeId);
    const taken = orders.find((o) => o.status === "VOID" || o.isDelivered);
    if (taken) throw new Error(`PO ${taken.code} sudah dikirim atau dibatalkan.`);

    const groups = new Map<string, { customerId: number | null; orderIds: number[] }>();
    for (const o of orders) {
      const g = groups.get(noteKey(o)) ?? { customerId: o.customerId, orderIds: [] };
      g.orderIds.push(o.id);
      groups.set(noteKey(o), g);
    }

    const delivery = await tx.delivery.create({
      data: {
        code: docCode("PG", (await lastSeq(tx, "PG")) + 1),
        storeId, vehicleId: vehicle.id, userId: user.id, date: body.date,
        driver: vehicle.driver, driverAssistance: vehicle.driverAssistance,
        note: body.note || null,
      },
    });

    let seq = await lastSeq(tx, "SJ");
    for (const g of groups.values()) {
      const note = await tx.deliveryNote.create({
        data: { code: docCode("SJ", ++seq), deliveryId: delivery.id, customerId: g.customerId },
      });
      // The guard stops two deliveries posted at the same moment from both taking
      // a PO, and skips one cancelled meanwhile: either way fewer rows update.
      const { count } = await tx.order.updateMany({
        where: { id: { in: g.orderIds }, isDelivered: false, status: { not: "VOID" } },
        data: { isDelivered: true, deliveryNoteId: note.id },
      });
      if (count !== g.orderIds.length) {
        throw new Error("Sebagian PO baru saja dikirim lewat pengiriman lain atau dibatalkan. Muat ulang daftarnya.");
      }
    }

    return { delivery, noteCount: groups.size };
  }));

  await audit(user.id, "create", "Delivery", result.delivery.id, {
    code: result.delivery.code, vehicleId: body.vehicleId, orderIds,
  });
  return ok(serialize({ id: result.delivery.id, code: result.delivery.code, noteCount: result.noteCount }), 201);
});

/**
 * Cancelling puts the POs back on the waiting list; the surat jalan go with the delivery.
 * Not once a PO on it is invoiced: that invoice bills what this trip delivered.
 */
export const DELETE = route(async ({ user, req }) => {
  requirePerm(user, "delivery.manage");
  const id = qpInt(req, "id");
  if (!id) throw new Error("Pengiriman tidak valid.");

  const delivery = await prisma.$transaction(async (tx) => {
    const d = await tx.delivery.findUnique({ where: { id }, select: { code: true, storeId: true } });
    if (!d) throw new Error("Pengiriman tidak ditemukan.");
    assertStoreAccess(user, d.storeId);

    // Lock its POs, so an invoice being made from one right now either lands
    // before the check below sees it, or waits and then finds the PO undelivered.
    await tx.$queryRaw`
      SELECT o.id FROM \`Order\` o JOIN \`DeliveryNote\` n ON n.id = o.deliveryNoteId
      WHERE n.deliveryId = ${id} FOR UPDATE`;
    const invoiced = await tx.order.findFirst({
      where: { deliveryNote: { deliveryId: id }, status: "PAID" },
      select: { code: true },
    });
    if (invoiced) {
      throw new Error(`PO ${invoiced.code} di pengiriman ini sudah dibuatkan invoice — pengiriman tidak bisa dibatalkan.`);
    }

    await tx.order.updateMany({
      where: { deliveryNote: { deliveryId: id } },
      data: { isDelivered: false, deliveryNoteId: null },
    });
    await tx.delivery.delete({ where: { id } });
    return d;
  });

  await audit(user.id, "cancel", "Delivery", id, { code: delivery.code });
  return ok({ id });
});
