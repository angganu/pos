import { z } from "zod";
import { prisma, serialize } from "@/lib/db";
import { route, ok, audit } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";

export const GET = route(async () => {
  const categories = await prisma.category.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { items: true } } },
  });
  return ok(
    serialize(categories.map((c) => ({ ...c, itemCount: c._count.items })))
  );
});

const schema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  description: z.string().max(255).optional().nullable(),
});

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "item.manage");
  const data = schema.parse(await req.json());
  const category = await prisma.category.create({ data });
  await audit(user.id, "create", "Category", category.id, data);
  return ok(serialize(category), 201);
});
