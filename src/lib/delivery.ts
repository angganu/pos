/**
 * Surat jalan rules, shared by the API, the pengiriman screen's preview and the
 * print page so all three agree on what goes on which surat jalan.
 * No server imports: this also runs in the browser.
 */

/** A sale line as a surat jalan shows it: in the item's base unit, which is what was sold. */
export type DeliveryLine = { itemId: number; code: string; name: string; unit: string; qty: number };

/** One item on a surat jalan: the total, plus what each invoice contributes to it. */
export type MergedLine = DeliveryLine & { perInvoice: { code: string; qty: number }[] };

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Which surat jalan a sale goes on: one per customer. A walk-in sale has no
 * customer to merge with, so it gets a surat jalan of its own.
 */
export function noteKey(sale: { id: number; customerId: number | null }): string {
  return sale.customerId ? `c${sale.customerId}` : `s${sale.id}`;
}

/** Several invoices' lines merged per item — the main table of a surat jalan. */
export function mergeLines(invoices: { code: string; lines: DeliveryLine[] }[]): MergedLine[] {
  const byItem = new Map<number, MergedLine>();
  for (const inv of invoices) {
    for (const l of inv.lines) {
      let m = byItem.get(l.itemId);
      if (!m) byItem.set(l.itemId, (m = { ...l, qty: 0, perInvoice: [] }));
      m.qty = round4(m.qty + l.qty);
      const part = m.perInvoice.find((p) => p.code === inv.code);
      if (part) part.qty = round4(part.qty + l.qty);
      else m.perInvoice.push({ code: inv.code, qty: l.qty });
    }
  }
  return [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
}
