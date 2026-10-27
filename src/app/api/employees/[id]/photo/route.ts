import { prisma } from "@/lib/db";
import { route, fail } from "@/lib/api";
import { can, requirePerm, type Permission } from "@/lib/rbac";
import { assertEmployeeAccess } from "@/lib/employees";

type Params = { id: string };

/** Every screen that lists employees shows their photo. */
const VIEWERS: Permission[] = ["employee.manage", "attendance.manage", "wage.manage", "user.manage"];

/**
 * Served from the database behind the session check rather than from public/:
 * a photo is personal data, and public/ serves anything to anyone.
 */
export const GET = route<Params>(async ({ user, params }) => {
  if (!VIEWERS.some((p) => can(user, p))) requirePerm(user, "employee.manage");

  const photo = await prisma.employeePhoto.findUnique({
    where: { employeeId: Number(params.id) || 0 },
    include: { employee: { select: { storeId: true } } },
  });
  if (!photo) return fail("Foto tidak ditemukan.", 404);
  assertEmployeeAccess(user, photo.employee.storeId);

  // Browser caching for this path is set in next.config.ts: the URL carries the photo's version.
  return new Response(new Uint8Array(photo.data), { headers: { "Content-Type": photo.mimeType } });
});
