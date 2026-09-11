import { z } from "zod";
import { prisma, serialize } from "@/lib/db";
import { route, ok, audit } from "@/lib/api";
import { can, requirePerm } from "@/lib/rbac";

export const GET = route(async ({ user }) => {
  // Managers/cashiers only ever see their own store in the switcher.
  const where = can(user, "store.all") ? { active: true } : { id: user.storeId ?? -1 };
  const stores = await prisma.store.findMany({ where, orderBy: { code: "asc" } });
  return ok(serialize(stores));
});

const schema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(160),
  address: z.string().max(255).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
});

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "store.all");
  const data = schema.parse(await req.json());
  const store = await prisma.store.create({ data });
  await audit(user.id, "create", "Store", store.id, data);
  return ok(serialize(store), 201);
});
