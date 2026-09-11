import { z } from "zod";
import { prisma, serialize } from "@/lib/db";
import { route, ok, audit } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";

export const GET = route(async () => {
  const units = await prisma.unit.findMany({ orderBy: { code: "asc" } });
  return ok(serialize(units));
});

const schema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(60),
});

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "item.manage");
  const data = schema.parse(await req.json());
  const unit = await prisma.unit.create({ data });
  await audit(user.id, "create", "Unit", unit.id, data);
  return ok(serialize(unit), 201);
});
