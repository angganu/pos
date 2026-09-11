import { z } from "zod";
import { MovementType, TransferStatus } from "@prisma/client";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qpInt, audit } from "@/lib/api";
import { requirePerm, assertStoreAccess } from "@/lib/rbac";
import { applyMovement, assertStockAvailable, nextSeq } from "@/lib/stock";
import { docCode } from "@/lib/format";

export const GET = route(async ({ user, req }) => {
  requirePerm(user, "transfer.manage");
  const storeId = qpInt(req, "storeId");

  const transfers = await prisma.transfer.findMany({
    where: storeId ? { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] } : {},
    include: {
      fromStore: { select: { code: true, name: true } },
      toStore: { select: { code: true, name: true } },
      user: { select: { name: true } },
      lines: { include: { item: { include: { baseUnit: true } } } },
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  return ok(
    serialize(
      transfers.map((t) => ({
        id: t.id, code: t.code, date: t.date, status: t.status,
        from: t.fromStore.name, to: t.toStore.name, user: t.user.name, note: t.note,
        lines: t.lines.map((l) => ({
          itemId: l.itemId, name: l.item.name, code: l.item.code,
          unit: l.item.baseUnit.name, qty: dec(l.qty),
        })),
      }))
    )
  );
});

const schema = z.object({
  fromStoreId: z.number().int(),
  toStoreId: z.number().int(),
  note: z.string().max(255).optional().nullable(),
  lines: z.array(z.object({ itemId: z.number().int(), qty: z.number().positive() })).min(1),
});

/** One transfer = TRANSFER_OUT at the source + TRANSFER_IN at the destination. */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "transfer.manage");
  const body = schema.parse(await req.json());
  if (body.fromStoreId === body.toStoreId) throw new Error("Toko asal dan tujuan tidak boleh sama.");
  assertStoreAccess(user, body.fromStoreId);

  const doc = await prisma.$transaction(async (tx) => {
    const seq = await nextSeq(tx, "transfer");

    const created = await tx.transfer.create({
      data: {
        code: docCode("TF", seq),
        fromStoreId: body.fromStoreId, toStoreId: body.toStoreId,
        userId: user.id, status: TransferStatus.RECEIVED, note: body.note ?? null,
        lines: { create: body.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })) },
      },
    });

    for (const l of body.lines) {
      await assertStockAvailable(tx, l.itemId, body.fromStoreId, l.qty);
      await applyMovement(tx, {
        itemId: l.itemId, storeId: body.fromStoreId, qty: -l.qty,
        type: MovementType.TRANSFER_OUT, userId: user.id,
        refType: "Transfer", refId: created.id,
      });
      await applyMovement(tx, {
        itemId: l.itemId, storeId: body.toStoreId, qty: l.qty,
        type: MovementType.TRANSFER_IN, userId: user.id,
        refType: "Transfer", refId: created.id,
      });
    }

    return created;
  });

  await audit(user.id, "create", "Transfer", doc.id, { code: doc.code });
  return ok(serialize({ id: doc.id, code: doc.code }), 201);
});
