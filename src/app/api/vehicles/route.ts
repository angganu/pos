import { z } from "zod";
import { prisma, serialize, dec } from "@/lib/db";
import { route, ok, qpInt, audit, readJson } from "@/lib/api";
import { can, requirePerm } from "@/lib/rbac";

export const GET = route(async ({ user }) => {
  // The pengiriman screen picks its vehicle from this list too.
  if (!can(user, "delivery.manage")) requirePerm(user, "vehicle.manage");
  const vehicles = await prisma.vehicle.findMany({ orderBy: { vehicleNo: "asc" } });
  return ok(serialize(vehicles));
});

/** "YYYY-MM-DD" from a date input, stored in a DATE column. */
const day = z.iso.date().transform((s) => new Date(s)).nullable().optional();
const capacity = z.number().nonnegative().max(1e9).nullable().optional();

const schema = z.object({
  vehicleNo: z.string().trim().toUpperCase().min(1).max(20),
  vehicleType: z.string().trim().min(1).max(60),
  driver: z.string().max(120).optional().nullable(),
  driverAssistance: z.string().max(120).optional().nullable(),
  minCapacity: capacity,
  maxCapacity: capacity,
  dueTax: day,
  dueStnk: day,
  dueKir: day,
  active: z.boolean().optional(),
});

function checkCapacity(min: number | null | undefined, max: number | null | undefined) {
  if (min != null && max != null && min > max) {
    throw new Error("Kapasitas minimum tidak boleh melebihi kapasitas maksimum.");
  }
}

export const POST = route(async ({ user, req }) => {
  requirePerm(user, "vehicle.manage");
  const data = schema.parse(await readJson(req));
  checkCapacity(data.minCapacity, data.maxCapacity);
  const vehicle = await prisma.vehicle.create({ data });
  await audit(user.id, "create", "Vehicle", vehicle.id, serialize(data));
  return ok(serialize(vehicle), 201);
});

const patchSchema = schema.partial().extend({ id: z.number().int() });

export const PATCH = route(async ({ user, req }) => {
  requirePerm(user, "vehicle.manage");
  const { id, ...data } = patchSchema.parse(await readJson(req));

  if (data.minCapacity !== undefined || data.maxCapacity !== undefined) {
    // A partial update still has to fit the bound it leaves untouched.
    const cur = await prisma.vehicle.findUniqueOrThrow({
      where: { id },
      select: { minCapacity: true, maxCapacity: true },
    });
    const keep = (sent: number | null | undefined, stored: unknown) =>
      sent !== undefined ? sent : stored == null ? null : dec(stored);
    checkCapacity(keep(data.minCapacity, cur.minCapacity), keep(data.maxCapacity, cur.maxCapacity));
  }

  const vehicle = await prisma.vehicle.update({ where: { id }, data });
  await audit(user.id, "update", "Vehicle", id, serialize(data));
  return ok(serialize(vehicle));
});

export const DELETE = route(async ({ user, req }) => {
  requirePerm(user, "vehicle.manage");
  const id = qpInt(req, "id");
  if (!id) throw new Error("Kendaraan tidak valid.");

  // A real delete, allowed only while no delivery names the vehicle;
  // is_active is how a vehicle is retired while keeping its history.
  if (await prisma.delivery.count({ where: { vehicleId: id } })) {
    throw new Error("Kendaraan sudah dipakai di pengiriman, jadi tidak bisa dihapus. Nonaktifkan saja.");
  }
  const vehicle = await prisma.vehicle.delete({ where: { id } });
  await audit(user.id, "delete", "Vehicle", id, { vehicleNo: vehicle.vehicleNo });
  return ok({ id });
});
