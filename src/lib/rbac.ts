import type { Role } from "@prisma/client";
import type { SessionUser } from "./auth";
import { AuthError } from "./errors";

/** Every permission the UI and the API gate on. */
export type Permission =
  | "sale.create"
  | "sale.void"
  | "shift.close"
  | "purchase.manage"
  | "return.manage"
  | "item.manage"
  | "price.manage"
  | "partner.manage"
  | "stock.view"
  | "stock.adjust"
  | "transfer.manage"
  | "report.view"
  | "supplier.compare"
  | "store.all"
  | "user.manage";

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: [
    "sale.create", "sale.void", "shift.close", "purchase.manage", "return.manage",
    "item.manage", "price.manage", "partner.manage", "stock.view", "stock.adjust",
    "transfer.manage", "report.view", "supplier.compare", "store.all", "user.manage",
  ],
  OWNER: [
    "sale.create", "sale.void", "shift.close", "purchase.manage", "return.manage",
    "item.manage", "price.manage", "partner.manage", "stock.view", "stock.adjust",
    "transfer.manage", "report.view", "supplier.compare", "store.all",
  ],
  MANAGER: [
    "sale.create", "sale.void", "shift.close", "purchase.manage", "return.manage",
    "price.manage", "partner.manage", "stock.view", "stock.adjust", "transfer.manage",
    "report.view",
  ],
  CASHIER: ["sale.create", "shift.close", "return.manage", "stock.view"],
};

export function can(user: Pick<SessionUser, "role">, perm: Permission): boolean {
  return MATRIX[user.role].includes(perm);
}

export function requirePerm(user: SessionUser, perm: Permission) {
  if (!can(user, perm)) throw new AuthError(`FORBIDDEN:${perm}`, 403);
}

/**
 * Resolves which store a request may act on.
 * ADMIN/OWNER may pass any storeId (or null for "all stores").
 * MANAGER/CASHIER are pinned to their own store, whatever they ask for.
 */
export function resolveStoreScope(
  user: SessionUser,
  requested?: number | null
): { storeId: number | null; pinned: boolean } {
  if (can(user, "store.all")) {
    return { storeId: requested ?? null, pinned: false };
  }
  if (!user.storeId) throw new AuthError("NO_STORE_ASSIGNED", 403);
  return { storeId: user.storeId, pinned: true };
}

/** Throws unless the user may write to this exact store. */
export function assertStoreAccess(user: SessionUser, storeId: number) {
  if (can(user, "store.all")) return;
  if (user.storeId !== storeId) throw new AuthError("FORBIDDEN:store", 403);
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  OWNER: "Pemilik / Owner",
  MANAGER: "Manajer Toko",
  CASHIER: "Kasir",
};

/** Navigation visibility, mirrored from the approved mockup. */
export const NAV_PERMS: Record<string, Permission> = {
  kasir: "sale.create",
  pembelian: "purchase.manage",
  retur: "return.manage",
  barang: "item.manage",
  harga: "price.manage",
  pelanggan: "partner.manage",
  supplier: "store.all",
  stok: "stock.view",
  opname: "transfer.manage",
  laba: "store.all",
  banding: "supplier.compare",
  laporan: "report.view",
  pengguna: "user.manage",
};
