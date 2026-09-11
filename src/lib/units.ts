import { prisma, dec } from "./db";

/**
 * Unit conversion.
 *
 * Every item is stored in ONE base unit (e.g. Gram) and always SOLD in it.
 * Purchases may use any registered alternative unit; `factor` converts that
 * unit into base units — "Sak 25 Kg" on a Gram item has factor 25000.
 */

export type UnitOption = {
  id: number;
  label: string;
  factor: number;
  isBase: boolean;
  unitCode: string;
};

export async function unitsForItem(itemId: number): Promise<UnitOption[]> {
  const rows = await prisma.itemUnit.findMany({
    where: { itemId },
    include: { unit: true },
    orderBy: [{ isBase: "desc" }, { factor: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    factor: dec(r.factor),
    isBase: r.isBase,
    unitCode: r.unit.code,
  }));
}

/** 2 × "Sak 25 Kg" (factor 25000) => 50000 base units. */
export function toBaseQty(qty: number, factor: number): number {
  return round4(qty * factor);
}

/** Price paid per purchase unit => cost per base unit (the HPP). */
export function toBasePrice(pricePerUnit: number, factor: number): number {
  if (!factor) return 0;
  return round4(pricePerUnit / factor);
}

/** Base units back into a purchase unit, for display. */
export function fromBaseQty(baseQty: number, factor: number): number {
  if (!factor) return 0;
  return round4(baseQty / factor);
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Human summary of a conversion, e.g. "2 × Sak 25 Kg = 50.000 Gram". */
export function describeConversion(
  qty: number,
  label: string,
  factor: number,
  baseUnitName: string
): string {
  const total = toBaseQty(qty, factor);
  return `${qty} × ${label} = ${new Intl.NumberFormat("id-ID").format(total)} ${baseUnitName}`;
}
