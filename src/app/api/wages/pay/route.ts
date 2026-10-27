import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, audit, readJson } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { assertEmployeeAccess } from "@/lib/employees";

const schema = z.object({
  ids: z.array(z.number().int()).min(1).max(500),
  /** true pays them; false undoes a payment made by mistake. */
  paid: z.boolean(),
});

/**
 * Marks wages paid (or back to unpaid). A paid wage is final: it can't be edited or
 * deleted, and the attendance it counted is locked.
 */
export const POST = route(async ({ user, req }) => {
  requirePerm(user, "wage.manage");
  const { ids, paid } = schema.parse(await readJson(req));

  const wages = await prisma.employeeWage.findMany({
    where: { id: { in: ids } },
    select: { employee: { select: { storeId: true } } },
  });
  if (wages.length !== new Set(ids).size) throw new Error("Sebagian upah tidak ditemukan.");
  for (const w of wages) assertEmployeeAccess(user, w.employee.storeId);

  // Wages already in the asked state are left as they are, with their first paid date.
  const { count } = await prisma.employeeWage.updateMany({
    where: { id: { in: ids }, status: paid ? "UNPAID" : "PAID" },
    data: paid ? { status: "PAID", paidAt: new Date() } : { status: "UNPAID", paidAt: null },
  });

  await audit(user.id, paid ? "pay" : "unpay", "EmployeeWage", null, { ids });
  return ok({ count });
});
