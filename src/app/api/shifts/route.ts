import { z } from "zod";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qpInt, audit } from "@/lib/api";
import { resolveStoreScope, assertStoreAccess } from "@/lib/rbac";
import { nextSeq } from "@/lib/stock";
import { round2 } from "@/lib/units";
import { docCode } from "@/lib/format";

/** The cashier's open shift, or the shift history for a store. */
export const GET = route(async ({ user, req }) => {
  const { storeId } = resolveStoreScope(user, qpInt(req, "storeId"));

  const open = await prisma.shift.findFirst({
    where: { userId: user.id, closedAt: null },
    include: { store: { select: { code: true, name: true } } },
  });

  const history = await prisma.shift.findMany({
    where: { ...(storeId ? { storeId } : {}), closedAt: { not: null } },
    include: { user: { select: { name: true } }, store: { select: { code: true } } },
    orderBy: { openedAt: "desc" },
    take: 30,
  });

  return ok(
    serialize({
      open: open
        ? {
            id: open.id, code: open.code, openedAt: open.openedAt,
            openingCash: dec(open.openingCash),
            store: open.store.name, storeCode: open.store.code,
          }
        : null,
      history: history.map((h) => ({
        id: h.id, code: h.code, store: h.store.code, user: h.user.name,
        openedAt: h.openedAt, closedAt: h.closedAt,
        openingCash: dec(h.openingCash), closingCash: dec(h.closingCash),
        expectedCash: dec(h.expectedCash), difference: dec(h.difference),
      })),
    })
  );
});

const openSchema = z.object({
  action: z.literal("open"),
  storeId: z.number().int(),
  openingCash: z.number().min(0).default(0),
});

const closeSchema = z.object({
  action: z.literal("close"),
  shiftId: z.number().int(),
  closingCash: z.number().min(0),
  note: z.string().max(255).optional().nullable(),
});

export const POST = route(async ({ user, req }) => {
  const body = z.union([openSchema, closeSchema]).parse(await req.json());

  if (body.action === "open") {
    assertStoreAccess(user, body.storeId);
    const existing = await prisma.shift.findFirst({ where: { userId: user.id, closedAt: null } });
    if (existing) throw new Error("Anda masih punya shift yang terbuka.");

    const shift = await prisma.$transaction(async (tx) => {
      const seq = await nextSeq(tx, "shift");
      return tx.shift.create({
        data: {
          code: docCode("SH", seq), storeId: body.storeId,
          userId: user.id, openingCash: body.openingCash,
        },
      });
    });

    await audit(user.id, "open", "Shift", shift.id);
    return ok(serialize({ id: shift.id, code: shift.code }), 201);
  }

  // Close: expected cash = opening float + cash sales during the shift.
  const shift = await prisma.shift.findUniqueOrThrow({ where: { id: body.shiftId } });
  if (shift.userId !== user.id) assertStoreAccess(user, shift.storeId);

  const cashSales = await prisma.sale.aggregate({
    where: { shiftId: shift.id, paymentMethod: "CASH", status: "POSTED" },
    _sum: { total: true },
  });

  const expected = round2(dec(shift.openingCash) + dec(cashSales._sum.total ?? 0));
  const difference = round2(body.closingCash - expected);

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      closedAt: new Date(), closingCash: body.closingCash,
      expectedCash: expected, difference, note: body.note ?? null,
    },
  });

  await audit(user.id, "close", "Shift", shift.id, { expected, counted: body.closingCash, difference });
  return ok({ id: shift.id, expected, difference });
});
