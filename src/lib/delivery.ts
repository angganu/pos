/**
 * Surat jalan rules, shared by the API, the pengiriman screen's preview and the
 * print page so all three agree on what goes on which surat jalan.
 * No server imports: this also runs in the browser.
 */

/** A PO line as a surat jalan shows it: in the item's base unit, which is what was ordered. */
export type DeliveryLine = { itemId: number; code: string; name: string; unit: string; qty: number };

/** One item on a surat jalan: the total, plus what each PO contributes to it. */
export type MergedLine = DeliveryLine & { perOrder: { code: string; qty: number }[] };

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Which surat jalan a PO goes on: one per customer. A walk-in PO has no
 * customer to merge with, so it gets a surat jalan of its own.
 */
export function noteKey(order: { id: number; customerId: number | null }): string {
  return order.customerId ? `c${order.customerId}` : `o${order.id}`;
}

/** Several POs' lines merged per item — the main table of a surat jalan. */
export function mergeLines(orders: { code: string; lines: DeliveryLine[] }[]): MergedLine[] {
  const byItem = new Map<number, MergedLine>();
  for (const order of orders) {
    for (const l of order.lines) {
      let m = byItem.get(l.itemId);
      if (!m) byItem.set(l.itemId, (m = { ...l, qty: 0, perOrder: [] }));
      m.qty = round4(m.qty + l.qty);
      const part = m.perOrder.find((p) => p.code === order.code);
      if (part) part.qty = round4(part.qty + l.qty);
      else m.perOrder.push({ code: order.code, qty: l.qty });
    }
  }
  return [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
}
