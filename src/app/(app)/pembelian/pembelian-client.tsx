"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, StatCard, Loading, SearchSelect, Chip, EmptyState } from "@/components/ui";
import { api } from "@/lib/client";
import { rp, num } from "@/lib/format";

type ItemRow = {
  id: number; code: string; name: string;
  baseUnit: { code: string; name: string };
  units: { id: number; label: string; factor: number; isBase: boolean }[];
  prices: { storeId: number; customerId: number | null; price: number }[];
};
type Supplier = { id: number; code: string; name: string; pic: string | null; phone: string | null; terms: string | null };
type Line = { itemId: number; unitLabel: string; factor: number; qty: number; pricePerUnit: number; discount: number };
/** Step 2 edits either each store's general price or each member's special price. */
type PriceMode = "store" | "member";

export default function PembelianClient() {
  const { storeId, user, stores } = useApp();
  const activeStoreId = storeId ?? user.storeId ?? stores[0]?.id ?? null;

  const { data: items, loading } = useFetch<ItemRow[]>("/api/items");
  const { data: suppliers } = useFetch<Supplier[]>("/api/suppliers");
  const { data: customers } = useFetch<{ id: number; code: string; name: string; tier: string }[]>("/api/customers");

  const [pickedSupplierId, setSupplierId] = useState<number | null>(null);
  // Until the user picks one, buy from the first supplier.
  const supplierId = pickedSupplierId ?? suppliers?.[0]?.id ?? null;
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  /** New selling prices keyed "itemId|storeId|customerId" (customerId "null" = the store's general price). */
  const [newPrices, setNewPrices] = useState<Record<string, number>>({});
  const [priceMode, setPriceMode] = useState<PriceMode>("store");
  const [customerQuery, setCustomerQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const itemMap = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const supplier = suppliers?.find((s) => s.id === supplierId) ?? null;

  const computed = lines.map((l) => {
    const item = itemMap.get(l.itemId);
    const baseQty = l.qty * l.factor;
    const pricePerBase = l.factor ? l.pricePerUnit / l.factor : 0;
    return { ...l, item, baseQty, pricePerBase, total: l.qty * l.pricePerUnit - l.discount };
  });

  const gross = computed.reduce((a, l) => a + l.total, 0);

  const visibleCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    return (customers ?? []).filter((c) => !q || `${c.code} ${c.name}`.toLowerCase().includes(q));
  }, [customers, customerQuery]);
  const priceColumns = priceMode === "store" ? stores.length : visibleCustomers.length;

  /** Prices typed so far in a mode — shown on its tab, since switching keeps them. */
  function priceCount(mode: PriceMode) {
    return Object.entries(newPrices).filter(([key, v]) => v > 0 && key.endsWith("|null") === (mode === "store")).length;
  }
  const total = gross - discount + tax;

  function addLine() {
    const first = items?.[0];
    if (!first) return;
    const buyUnit = first.units.find((u) => !u.isBase) ?? first.units[0];
    setLines((c) => [
      ...c,
      { itemId: first.id, unitLabel: buyUnit.label, factor: buyUnit.factor, qty: 1, pricePerUnit: 0, discount: 0 },
    ]);
  }

  function patchLine(i: number, patch: Partial<Line>) {
    setLines((c) => c.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function changeItem(i: number, itemId: number) {
    const item = itemMap.get(itemId);
    if (!item) return;
    const buyUnit = item.units.find((u) => !u.isBase) ?? item.units[0];
    patchLine(i, { itemId, unitLabel: buyUnit.label, factor: buyUnit.factor });
  }

  async function save() {
    if (!activeStoreId || !supplierId || !lines.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const priceUpdates = Object.entries(newPrices)
        .map(([key, price]) => {
          const [itemId, sId, cId] = key.split("|");
          return {
            itemId: Number(itemId), storeId: Number(sId),
            customerId: cId === "null" ? null : Number(cId), price,
          };
        })
        .filter((p) => p.price > 0);

      const res = await api.post<{ code: string }>("/api/purchases", {
        supplierId, storeId: activeStoreId, discount, tax,
        lines: lines.map((l) => ({
          itemId: l.itemId, unitLabel: l.unitLabel, factor: l.factor,
          qty: l.qty, pricePerUnit: l.pricePerUnit, discount: l.discount,
        })),
        newPrices: priceUpdates,
      });
      setMsg({ kind: "ok", text: `Pembelian ${res.code} tersimpan. Stok sudah bertambah.` });
      setLines([]);
      setNewPrices({});
      setDiscount(0);
      setTax(0);
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        kicker="Pembelian / Purchasing"
        title="Terima barang dari supplier"
        subtitle={
          <>
            Masuk ke <strong>{stores.find((s) => s.id === activeStoreId)?.name ?? "—"}</strong> · satuan
            beli bebas, sistem mengonversi ke satuan dasar
          </>
        }
        actions={
          <button className="btn btn-primary h-11 px-4 text-[15px]" onClick={save} disabled={busy || !lines.length}>
            {busy ? "Menyimpan…" : "Simpan & tambah stok"}
          </button>
        }
      />

      {msg && (
        <div
          role="alert"
          className={`mx-6 mt-4 px-4 py-3 text-sm font-semibold ring-1 ${
            msg.kind === "ok" ? "bg-teal-200 text-teal-700 ring-teal-400" : "bg-brand-100 text-brand-800 ring-brand-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 px-6 pt-4">
        <div className="bg-white p-3.5 ring-1 ring-divider">
          <label htmlFor="sup" className="label-kicker mb-1.5 block">Supplier / Vendor</label>
          <SearchSelect
            id="sup"
            className="input h-11 text-[15px] font-semibold"
            value={supplierId !== null ? String(supplierId) : ""}
            onChange={(v) => setSupplierId(Number(v))}
            options={(suppliers ?? []).map((s) => ({ value: String(s.id), label: `${s.code} · ${s.name}` }))}
          />
          {supplier && (
            <div className="mt-2 text-xs text-slate-7">
              {supplier.pic} · {supplier.phone} · {supplier.terms}
            </div>
          )}
        </div>
        <StatCard label="Barang diterima" value={`${lines.length} jenis`} hint="Stok bertambah setelah disimpan" />
        <StatCard label="Total faktur" value={rp(total)} hint={`Bruto ${rp(gross)} · diskon ${rp(discount)}`} />
      </div>

      {/* Step 1 — lines */}
      <div className="px-6 pt-6">
        <h4 className="mb-2.5 text-base">
          1 · Barang yang dibeli{" "}
          <span className="text-[13px] font-normal text-slate-7">— satuan beli bebas, sistem mengonversi</span>
        </h4>
        <div className="table-wrap">
          <table className="tbl min-w-[900px]">
            <thead>
              <tr>
                <th>Barang / Item</th>
                <th className="w-[180px]">Satuan beli</th>
                <th className="w-[110px]">Qty</th>
                <th className="w-[160px] text-right">Harga / satuan beli</th>
                <th className="w-[150px] text-right">Setara / base</th>
                <th className="w-[140px] text-right">Subtotal</th>
                <th className="w-[50px]" />
              </tr>
            </thead>
            <tbody>
              {computed.map((l, i) => (
                <tr key={i}>
                  <td>
                    <SearchSelect
                      className="input h-9"
                      value={String(l.itemId)}
                      onChange={(v) => changeItem(i, Number(v))}
                      options={(items ?? []).map((it) => ({ value: String(it.id), label: `${it.code} · ${it.name}` }))}
                    />
                  </td>
                  <td>
                    <SearchSelect
                      className="input h-9"
                      value={l.unitLabel}
                      onChange={(v) => {
                        const u = l.item?.units.find((x) => x.label === v);
                        if (u) patchLine(i, { unitLabel: u.label, factor: u.factor });
                      }}
                      options={(l.item?.units ?? []).map((u) => ({ value: u.label, label: u.label }))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="input h-9 text-right"
                      value={l.qty}
                      onChange={(e) => patchLine(i, { qty: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      className="input h-9 text-right font-semibold"
                      value={l.pricePerUnit ? num(l.pricePerUnit) : ""}
                      onChange={(e) => patchLine(i, { pricePerUnit: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                    />
                  </td>
                  <td className="text-right text-[13px]">
                    <div className="font-semibold">{rp(l.pricePerBase)} / {l.item?.baseUnit.code === "GR" ? "g" : "pcs"}</div>
                    <div className="text-[11px] text-slate-7">= {num(l.baseQty)} {l.item?.baseUnit.name} masuk stok</div>
                  </td>
                  <td className="text-right text-[15px] font-semibold">{rp(l.total)}</td>
                  <td>
                    <button
                      className="btn btn-ghost px-1.5 py-1"
                      onClick={() => setLines((c) => c.filter((_, idx) => idx !== i))}
                      aria-label="Hapus baris"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-6">
                    Belum ada barang. Klik “Tambah baris”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn btn-secondary" onClick={addLine}>
            <Plus size={15} /> Tambah baris
          </button>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <span className="label-kicker">Diskon faktur</span>
              <input
                inputMode="numeric"
                className="input h-9 w-32 text-right"
                value={discount ? num(discount) : ""}
                onChange={(e) => setDiscount(Number(e.target.value.replace(/\D/g, "")) || 0)}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="label-kicker">PPN</span>
              <input
                inputMode="numeric"
                className="input h-9 w-32 text-right"
                value={tax ? num(tax) : ""}
                onChange={(e) => setTax(Number(e.target.value.replace(/\D/g, "")) || 0)}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Step 2 — new selling prices */}
      {lines.length > 0 && (
        <div className="px-6 pb-10 pt-7">
          <h4 className="mb-1 text-base">
            2 · Atur harga jual baru{" "}
            <span className="text-[13px] font-normal text-slate-7">
              {priceMode === "store"
                ? "— harga umum per toko"
                : `— harga khusus tiap member di ${stores.find((s) => s.id === activeStoreId)?.name ?? "toko ini"}`}
            </span>
          </h4>
          <p className="mb-3 max-w-[80ch] text-[13px] text-slate-7">
            Kosongkan bila harga lama tetap dipakai. Margin dihitung terhadap harga beli faktur ini.
            {priceMode === "member" && " Member tanpa harga khusus membayar harga toko."}
          </p>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Chip active={priceMode === "store"} onClick={() => setPriceMode("store")}>
              Harga toko{priceCount("store") ? ` (${priceCount("store")})` : ""}
            </Chip>
            <Chip active={priceMode === "member"} onClick={() => activeStoreId && setPriceMode("member")}>
              Harga member{priceCount("member") ? ` (${priceCount("member")})` : ""}
            </Chip>
            {priceMode === "member" && (
              <input
                className="input ml-2 h-8 max-w-[260px] text-[13px]"
                placeholder={`Cari member… (${customers?.length ?? 0} member)`}
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
              />
            )}
          </div>

          {priceMode === "member" && visibleCustomers.length === 0 ? (
            <EmptyState title={customers?.length ? "Tidak ada member yang cocok." : "Belum ada member."} />
          ) : (
            <div className="table-wrap">
              <table className="tbl" style={{ minWidth: 240 + 130 + priceColumns * 150 }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[2] w-[240px] bg-bg shadow-[inset_-1px_0_0_var(--color-divider)]">
                      Barang
                    </th>
                    <th className="w-[130px] text-right">HPP faktur ini</th>
                    {priceMode === "store"
                      ? stores.map((s) => (
                          <th key={s.id} className="w-[150px] text-right">{s.name}</th>
                        ))
                      : visibleCustomers.map((c) => (
                          <th key={c.id} className="w-[150px] text-right">
                            <div>{c.name}</div>
                            <div className="text-[10px] font-semibold normal-case tracking-normal text-slate-6">
                              {c.code} · {c.tier}
                            </div>
                          </th>
                        ))}
                  </tr>
                </thead>
                <tbody>
                  {computed.map((l, i) => {
                    const priceOf = (sId: number | null, cId: number | null) =>
                      l.item?.prices.find((p) => p.storeId === sId && p.customerId === cId)?.price ?? 0;
                    const set = (key: string, price: number) => setNewPrices((p) => ({ ...p, [key]: price }));
                    // What a member without a special price pays here: the store price, new or current.
                    const storePrice = newPrices[`${l.itemId}|${activeStoreId}|null`] || priceOf(activeStoreId, null);
                    return (
                      <tr key={i}>
                        <td className="sticky left-0 z-[1] bg-bg shadow-[inset_-1px_0_0_var(--color-divider)]">
                          <div className="text-sm font-semibold">{l.item?.name}</div>
                          <div className="text-[11px] text-slate-7">per {l.item?.baseUnit.name.toLowerCase()}</div>
                        </td>
                        <td className="text-right text-sm font-semibold">{rp(l.pricePerBase)}</td>
                        {priceMode === "store"
                          ? stores.map((s) => {
                              const key = `${l.itemId}|${s.id}|null`;
                              return (
                                <td key={s.id}>
                                  <PriceInput
                                    value={newPrices[key]}
                                    current={priceOf(s.id, null)}
                                    cost={l.pricePerBase}
                                    onChange={(v) => set(key, v)}
                                  />
                                </td>
                              );
                            })
                          : visibleCustomers.map((c) => {
                              const key = `${l.itemId}|${activeStoreId}|${c.id}`;
                              return (
                                <td key={c.id}>
                                  <PriceInput
                                    value={newPrices[key]}
                                    current={priceOf(activeStoreId, c.id)}
                                    fallback={storePrice}
                                    cost={l.pricePerBase}
                                    onChange={(v) => set(key, v)}
                                  />
                                </td>
                              );
                            })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A selling-price input with the margin it gives against this invoice's cost. */
function PriceInput({
  value,
  current,
  fallback,
  cost,
  onChange,
}: {
  value: number | undefined;
  current: number;
  /** Member cells: the store price the member pays while no special price is set. */
  fallback?: number;
  cost: number;
  onChange: (price: number) => void;
}) {
  const followsStore = fallback !== undefined && !value && !current;
  const effective = value || current || fallback || 0;
  const margin = effective ? ((effective - cost) / effective) * 100 : 0;
  return (
    <>
      <input
        inputMode="numeric"
        className="input h-9 text-right font-semibold"
        placeholder={current ? num(current) : followsStore ? "ikut harga toko" : "0"}
        value={value ? num(value) : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
      />
      <div className={`mt-1 text-right text-[11px] ${margin < 15 ? "text-amber-700" : "text-slate-7"}`}>
        {followsStore ? "harga toko · " : ""}margin {margin.toFixed(0)}%
      </div>
    </>
  );
}
