"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Barcode, Minus, Plus, X, Pause } from "lucide-react";
import clsx from "clsx";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { Chip, EmptyState, Modal, Loading } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { rp, num, initials } from "@/lib/format";

type ItemRow = {
  id: number; code: string; barcode: string | null; name: string;
  category: { id: number; name: string };
  baseUnit: { code: string; name: string };
  stock: number; minStock: number; low: boolean;
  priceMin: number; priceMax: number;
  prices: { storeId: number; customerId: number | null; price: number }[];
};

type CustomerRow = { id: number; code: string; name: string; tier: string; phone: string | null; points: number };
type CartLine = { itemId: number; qty: number; discount: number };
type Slip = Awaited<ReturnType<typeof postOrder>>;

/** The kasir takes a purchase order: paid later, by the invoice made once it is delivered. */
async function postOrder(body: unknown) {
  return api.post<{
    id: number; code: string; date: string;
    store: { name: string; address: string | null; phone: string | null };
    customer: { name: string; code: string } | null;
    cashier: string; subtotal: number; discount: number; tax: number; total: number;
    lines: { name: string; code: string; unit: string; qty: number; unitPrice: number; discount: number; total: number; isMember: boolean }[];
  }>("/api/orders", body);
}

const TAX_RATE = 11;

export default function KasirClient() {
  const { user, storeId, stores } = useApp();
  const effectiveStoreId = storeId ?? user.storeId ?? stores[0]?.id ?? null;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [taxOn, setTaxOn] = useState(true);
  const [category, setCategory] = useState<string>("Semua");
  const [scan, setScan] = useState("");
  const [dialog, setDialog] = useState<null | "confirm" | "cust" | "check" | "slip" | "held">(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkQ, setCheckQ] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  const itemsUrl = effectiveStoreId ? `/api/items${qs({ storeId: effectiveStoreId })}` : null;
  const { data: items, loading } = useFetch<ItemRow[]>(itemsUrl, [effectiveStoreId]);
  const { data: customers } = useFetch<CustomerRow[]>("/api/customers");
  const { data: held, refresh: refreshHeld } = useFetch<
    { id: number; label: string; total: number; customer: string; createdAt: string; payload: CartLine[] }[]
  >(effectiveStoreId ? `/api/held-sales${qs({ storeId: effectiveStoreId })}` : null, [effectiveStoreId]);
  const { data: checkData } = useFetch<{
    stores: { id: number; code: string; name: string }[];
    rows: {
      itemId: number; code: string; name: string; unit: string;
      perStore: { storeId: number; storeCode: string; price: number; isMemberPrice: boolean; stock: number }[];
      highestPrice: number; highestStore: string;
    }[];
  }>(dialog === "check" ? `/api/price-check${qs({ q: checkQ, customerId })}` : null, [dialog, checkQ, customerId]);

  const itemMap = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const customer = customers?.find((c) => c.id === customerId) ?? null;

  /** Price for (item, this store, this customer) — member price wins, else store price. */
  const priceFor = useCallback(
    (item: ItemRow) => {
      const general = item.prices.find((p) => p.customerId === null)?.price ?? 0;
      if (!customerId) return { price: general, general, isMember: false };
      const member = item.prices.find((p) => p.customerId === customerId)?.price;
      return member !== undefined
        ? { price: member, general, isMember: true }
        : { price: general, general, isMember: false };
    },
    [customerId]
  );

  const lines = useMemo(
    () =>
      cart
        .map((l) => {
          const item = itemMap.get(l.itemId);
          if (!item) return null;
          const { price, general, isMember } = priceFor(item);
          return { ...l, item, price, general, isMember, total: l.qty * price - l.discount };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [cart, itemMap, priceFor]
  );

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
    const discount = lines.reduce((a, l) => a + l.discount, 0);
    const saved = lines.reduce((a, l) => a + (l.general - l.price) * l.qty, 0);
    const taxable = subtotal - discount;
    const tax = taxOn ? Math.round(taxable * (TAX_RATE / 100)) : 0;
    return { subtotal, discount, tax, total: taxable + tax, saved };
  }, [lines, taxOn]);

  const step = (item: ItemRow) => (item.baseUnit.code === "GR" ? 250 : 1);

  const add = useCallback(
    (item: ItemRow) => {
      setError(null);
      setCart((c) => {
        const i = c.findIndex((l) => l.itemId === item.id);
        if (i >= 0) {
          const next = [...c];
          next[i] = { ...next[i], qty: next[i].qty + step(item) };
          return next;
        }
        return [...c, { itemId: item.id, qty: step(item), discount: 0 }];
      });
    },
    []
  );

  const bump = (itemId: number, dir: 1 | -1) => {
    const item = itemMap.get(itemId);
    if (!item) return;
    setCart((c) =>
      c.flatMap((l) => {
        if (l.itemId !== itemId) return [l];
        const qty = l.qty + dir * step(item);
        return qty <= 0 ? [] : [{ ...l, qty }];
      })
    );
  };

  function handleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const code = scan.trim().toLowerCase();
    if (!code) return;
    const found = (items ?? []).find(
      (i) => i.barcode?.toLowerCase() === code || i.code.toLowerCase() === code
    );
    if (found) {
      add(found);
      setScan("");
    } else {
      setError(`Barang dengan kode "${scan}" tidak ditemukan.`);
    }
  }

  async function hold() {
    if (!cart.length || !effectiveStoreId) return;
    await api.post("/api/held-sales", {
      storeId: effectiveStoreId,
      label: `Ditahan ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
      customerId, total: totals.total, payload: cart,
    });
    setCart([]);
    refreshHeld();
  }

  async function submit() {
    if (!effectiveStoreId || !cart.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postOrder({
        storeId: effectiveStoreId, customerId,
        taxEnabled: taxOn, taxRate: TAX_RATE,
        lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty, discount: l.discount })),
      });
      setSlip(result);
      setCart([]);
      setDialog("slip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan PO.");
    } finally {
      setBusy(false);
    }
  }

  // Keyboard shortcuts — F2 price check, F3 hold, F6 customer, F12 save the PO.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDialog(null);
      if (e.key === "F2") { e.preventDefault(); setDialog("check"); }
      if (e.key === "F3") { e.preventDefault(); hold(); }
      if (e.key === "F6") { e.preventDefault(); setDialog("cust"); }
      if (e.key === "F12") { e.preventDefault(); if (cart.length) setDialog("confirm"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const categories = useMemo(() => {
    const set = new Set((items ?? []).map((i) => i.category.name));
    return ["Semua", ...[...set].sort()];
  }, [items]);

  const tiles = (items ?? []).filter((i) => category === "Semua" || i.category.name === category);

  if (!effectiveStoreId) {
    return <EmptyState title="Pilih satu toko untuk mulai membuat PO." />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-wrap items-stretch">
      {/* LEFT — scanner + quick pick */}
      <div className="flex h-full min-w-0 flex-[1_1_300px] flex-col border-r-2 border-divider">
        <div className="flex flex-none flex-wrap items-end gap-3 border-b-2 border-divider px-5 py-4">
          <div className="min-w-0 flex-[1_1_320px]">
            <label htmlFor="scan" className="label-kicker mb-1.5 block">
              Pindai barcode atau ketik kode barang / Scan or type item code
            </label>
            <div className="flex items-center bg-white ring-2 ring-ink">
              <span className="px-3 text-brand-600">
                <Barcode size={22} />
              </span>
              <input
                id="scan"
                ref={scanRef}
                autoFocus
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={handleScan}
                placeholder="BR-001 · Enter untuk tambah"
                className="h-12 min-w-0 flex-1 border-0 bg-transparent text-lg font-semibold outline-none placeholder:text-slate-5"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary h-12" onClick={() => setDialog("check")}>
              <span className="text-[11px] text-slate-6">F2</span> Cek Harga
            </button>
            <button className="btn btn-secondary h-12" onClick={hold} disabled={!cart.length}>
              <span className="text-[11px] text-slate-6">F3</span> Tahan
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex-none bg-brand-100 px-5 py-2 text-sm font-semibold text-brand-800">
            {error}
          </div>
        )}

        <div className="flex flex-none flex-wrap items-center gap-1.5 px-5 pb-2.5 pt-3">
          <span className="label-kicker mr-1">Pilih cepat / Quick pick</span>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {loading ? (
            <Loading />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2.5">
              {tiles.map((it) => {
                const { price, isMember } = priceFor(it);
                return (
                  <button
                    key={it.id}
                    onClick={() => add(it)}
                    className="flex min-w-0 flex-col bg-white text-left ring-1 ring-divider transition-colors hover:ring-brand-600"
                  >
                    <div className="flex h-14 w-full items-center justify-center border-b border-divider bg-slate-2 text-lg font-extrabold text-slate-6">
                      {initials(it.name)}
                    </div>
                    <div className="flex w-full min-w-0 flex-col gap-0.5 px-2.5 pb-2.5 pt-2">
                      <div className="text-[13px] font-semibold leading-tight">{it.name}</div>
                      <div className={clsx("text-xs", isMember ? "font-semibold text-brand-700" : "text-slate-8")}>
                        {rp(price)} / {it.baseUnit.code === "GR" ? "g" : "pcs"}
                      </div>
                      <div className={clsx("text-[11px]", it.low ? "text-amber-700" : "text-slate-6")}>
                        {it.low ? "Stok tipis · " : "Stok "}
                        {num(it.stock)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — customer, cart list, totals */}
      <div className="flex h-full min-w-0 max-w-[480px] flex-[1_1_320px] flex-col overflow-hidden bg-surface">
        <div className="flex-none border-b-2 border-divider px-5 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-2.5">
            <span className="label-kicker">Pelanggan / Customer</span>
            <button className="btn btn-ghost px-1.5 py-0.5 text-xs" onClick={() => setDialog("cust")}>
              Ganti (F6)
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-none items-center justify-center bg-slate-3 text-xs font-extrabold text-slate-8">
              {customer ? initials(customer.name) : "UM"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{customer?.name ?? "Pelanggan Umum"}</div>
              <div className="truncate text-[11px] text-slate-7">
                {customer ? `${customer.code} · ${num(customer.points)} poin` : "Tanpa kartu member — harga umum"}
                {totals.saved > 0 && ` · Hemat ${rp(totals.saved)}`}
              </div>
            </div>
            {customer && <span className="tag tag-violet">{customer.tier}</span>}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-none items-center justify-between gap-2.5 px-5 pb-2 pt-3">
            <span className="label-kicker">
              Barang dipesan / Items <span className="text-ink">({lines.length})</span>
            </span>
            <button className="btn btn-ghost px-1.5 py-0.5 text-xs" onClick={() => setCart([])} disabled={!cart.length}>
              Kosongkan
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 pb-3">
            {lines.length === 0 && (
              <EmptyState
                title="Keranjang kosong — pindai barcode atau pilih barang di sebelah kiri."
                hint="Cart is empty — scan or pick an item on the left."
              />
            )}
            {lines.map((l, i) => (
              <div key={l.itemId} className="flex flex-col gap-1.5 bg-white p-2.5 ring-1 ring-divider">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-[30px] w-[30px] flex-none items-center justify-center bg-slate-2 text-[11px] font-extrabold text-slate-6">
                    {initials(l.item.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-tight">{l.item.name}</div>
                    <div className="text-[11px] text-slate-7">
                      #{i + 1} · {l.item.code} ·{" "}
                      {l.isMember ? `harga member · normal ${rp(l.general)}` : "harga umum toko ini"}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost flex-none px-1.5 py-0.5"
                    onClick={() => setCart((c) => c.filter((x) => x.itemId !== l.itemId))}
                    aria-label={`Hapus ${l.item.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <button className="btn btn-secondary h-[30px] w-[30px] justify-center p-0" onClick={() => bump(l.itemId, -1)}>
                      <Minus size={15} />
                    </button>
                    <div className="min-w-[70px] text-center text-[13px] font-semibold">
                      {num(l.qty)} {l.item.baseUnit.code === "GR" ? "g" : "pcs"}
                    </div>
                    <button className="btn btn-secondary h-[30px] w-[30px] justify-center p-0" onClick={() => bump(l.itemId, 1)}>
                      <Plus size={15} />
                    </button>
                  </div>
                  <div className="text-xs text-slate-7">× {rp(l.price)}</div>
                  <div className="ml-auto text-right">
                    <div className="text-[15px] font-semibold leading-tight">{rp(l.total)}</div>
                    {l.discount > 0 && <div className="text-[11px] text-brand-700">diskon {rp(l.discount)}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky totals */}
        <div className="sticky bottom-0 flex flex-none flex-col gap-1.5 border-t-2 border-divider bg-surface px-5 pb-3 pt-2.5">
          <div className="flex justify-between text-[13px]">
            <span>Subtotal <span className="text-slate-7">({lines.length})</span></span>
            <span className="font-semibold">{rp(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span>Diskon</span>
            <span className="font-semibold text-brand-700">– {rp(totals.discount)}</span>
          </div>
          <label className="flex cursor-pointer items-center justify-between text-[13px]">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              PPN {TAX_RATE}%
            </span>
            <span className="font-semibold">{rp(totals.tax)}</span>
          </label>

          <div className="my-0.5 h-0.5 bg-divider" />

          <div className="flex items-baseline justify-between">
            <span className="label-kicker">Total</span>
            <span className="text-3xl font-extrabold leading-none">{rp(totals.total)}</span>
          </div>

          <div className="mt-0.5 flex flex-col gap-1.5">
            <button
              className="btn btn-primary h-14 w-full justify-between px-5 text-lg"
              onClick={() => setDialog("confirm")}
              disabled={!cart.length}
            >
              <span>SIMPAN PO <span className="text-[13px] font-normal opacity-75">F12</span></span>
              <span>{rp(totals.total)}</span>
            </button>
            <div className="flex gap-1.5">
              {(held?.length ?? 0) > 0 && (
                <button className="btn btn-secondary h-8 flex-1 justify-center gap-1.5 text-xs" onClick={() => setDialog("held")}>
                  <Pause size={13} /> Ditahan <span className="tag tag-neutral">{held?.length}</span>
                </button>
              )}
              <button
                className="btn btn-secondary h-8 flex-1 justify-center text-xs"
                onClick={() => slip && setDialog("slip")}
                disabled={!slip}
              >
                PO terakhir
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm the PO */}
      <Modal
        open={dialog === "confirm"}
        onClose={() => setDialog(null)}
        title="Simpan purchase order (PO)"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDialog(null)}>Batal (Esc)</button>
            <button className="btn btn-primary h-11 px-5 text-base" onClick={submit} disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan & Cetak PO"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && (
            <div role="alert" className="bg-brand-100 px-3 py-2 text-sm font-semibold text-brand-800">{error}</div>
          )}
          <div className="flex items-baseline justify-between border-y-2 border-divider py-3.5">
            <span className="label-kicker">Total PO</span>
            <span className="text-4xl font-extrabold leading-none">{rp(totals.total)}</span>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <span>Pelanggan</span>
              <span className="text-right font-semibold">{customer?.name ?? "Pelanggan Umum"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Barang</span>
              <span className="font-semibold">{lines.length} jenis</span>
            </div>
          </div>

          {!customer && (
            <p className="m-0 text-[13px] text-amber-700">
              Tanpa pelanggan, surat jalannya tidak beralamat. Pilih pelanggan (F6) bila barang diantar.
            </p>
          )}
          <p className="m-0 bg-bg px-3.5 py-3 text-[13px] text-slate-8">
            PO ini belum dibayar. Barangnya dikirim lewat menu Pengiriman, lalu tagihannya dibuat di menu Buat
            Invoice sesuai barang yang diterima pelanggan.
          </p>
        </div>
      </Modal>

      {/* Customer picker */}
      <Modal open={dialog === "cust"} onClose={() => setDialog(null)} title="Pilih pelanggan / Choose customer">
        <p className="mb-3 text-[13px] text-slate-7">
          Harga baris akan otomatis mengikuti harga khusus member di toko ini.
        </p>
        <div className="flex flex-col border-t-2 border-divider">
          <button
            onClick={() => { setCustomerId(null); setDialog(null); }}
            className={clsx("flex items-center gap-3 border-b border-divider px-2 py-3 text-left hover:bg-slate-2", !customerId && "bg-brand-100")}
          >
            <div className="flex h-9 w-9 flex-none items-center justify-center bg-slate-3 text-xs font-extrabold text-slate-8">UM</div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Pelanggan Umum</div>
              <div className="text-xs text-slate-7">Harga umum toko</div>
            </div>
            <span className="tag tag-neutral">Non-member</span>
          </button>
          {(customers ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => { setCustomerId(c.id); setDialog(null); }}
              className={clsx("flex items-center gap-3 border-b border-divider px-2 py-3 text-left hover:bg-slate-2", customerId === c.id && "bg-brand-100")}
            >
              <div className="flex h-9 w-9 flex-none items-center justify-center bg-slate-3 text-xs font-extrabold text-slate-8">
                {initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{c.name}</div>
                <div className="text-xs text-slate-7">{c.code} · {c.phone ?? "—"}</div>
              </div>
              <span className="tag tag-violet">{c.tier}</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Price check */}
      <Modal open={dialog === "check"} onClose={() => setDialog(null)} title="Cek harga / Price check — tanpa menjual" width="720px">
        <input
          className="input mb-3 h-11 text-base"
          placeholder="Ketik nama atau kode barang…"
          value={checkQ}
          onChange={(e) => setCheckQ(e.target.value)}
          autoFocus
        />
        <div className="table-wrap max-h-[50vh] overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Barang</th>
                {(checkData?.stores ?? []).map((s) => (
                  <th key={s.id} className="text-right">{s.code}</th>
                ))}
                <th className="text-right">Termahal</th>
              </tr>
            </thead>
            <tbody>
              {(checkData?.rows ?? []).map((r) => (
                <tr key={r.itemId}>
                  <td>
                    <div className="text-[13px] font-semibold">{r.name}</div>
                    <div className="text-[11px] text-slate-7">{r.code} · per {r.unit}</div>
                  </td>
                  {r.perStore.map((p) => (
                    <td key={p.storeId} className={clsx("text-right text-[13px]", p.isMemberPrice && "font-semibold text-brand-700")}>
                      {rp(p.price)}
                    </td>
                  ))}
                  <td className="text-right text-[13px] font-semibold">{rp(r.highestPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Held sales */}
      <Modal open={dialog === "held"} onClose={() => setDialog(null)} title="Transaksi ditahan / Parked sales">
        <div className="flex flex-col border-t-2 border-divider">
          {(held ?? []).map((h) => (
            <div key={h.id} className="flex items-center gap-3 border-b border-divider py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{h.label}</div>
                <div className="text-xs text-slate-7">{h.customer} · {new Date(h.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
              <span className="text-sm font-semibold">{rp(h.total)}</span>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  setCart(h.payload);
                  await api.del(`/api/held-sales?id=${h.id}`);
                  refreshHeld();
                  setDialog(null);
                }}
              >
                Lanjutkan
              </button>
            </div>
          ))}
          {(held?.length ?? 0) === 0 && <EmptyState title="Tidak ada transaksi ditahan." />}
        </div>
      </Modal>

      {/* PO slip */}
      <Modal
        open={dialog === "slip"}
        onClose={() => setDialog(null)}
        title="Purchase order (PO)"
        width="380px"
        footer={
          <>
            <button className="btn btn-secondary no-print" onClick={() => setDialog(null)}>Tutup</button>
            <button className="btn btn-primary no-print" onClick={() => window.print()}>Cetak</button>
          </>
        }
      >
        {slip && (
          <div className="font-mono text-xs leading-relaxed ring-1 ring-divider p-4">
            <div className="text-center font-bold tracking-widest">KASAKU</div>
            <div className="text-center">{slip.store.name}</div>
            <div className="text-center">{slip.store.address}</div>
            <div className="my-2 border-t border-dashed border-slate-5" />
            <div className="text-center font-bold tracking-widest">PURCHASE ORDER</div>
            <div className="flex justify-between"><span>No. {slip.code}</span><span>{new Date(slip.date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span></div>
            <div className="flex justify-between"><span>Kasir</span><span>{slip.cashier}</span></div>
            <div className="flex justify-between"><span>Pelanggan</span><span>{slip.customer?.name ?? "Umum"}</span></div>
            <div className="my-2 border-t border-dashed border-slate-5" />
            {slip.lines.map((l, i) => (
              <div key={i} className="mb-1">
                <div>{l.name}</div>
                <div className="flex justify-between">
                  <span>{num(l.qty)} {l.unit} × {rp(l.unitPrice)}</span>
                  <span>{rp(l.total)}</span>
                </div>
              </div>
            ))}
            <div className="my-2 border-t border-dashed border-slate-5" />
            <div className="flex justify-between"><span>Subtotal</span><span>{rp(slip.subtotal)}</span></div>
            <div className="flex justify-between"><span>Diskon</span><span>-{rp(slip.discount)}</span></div>
            <div className="flex justify-between"><span>PPN {TAX_RATE}%</span><span>{rp(slip.tax)}</span></div>
            <div className="mt-1 flex justify-between text-sm font-bold"><span>TOTAL</span><span>{rp(slip.total)}</span></div>
            <div className="my-2 border-t border-dashed border-slate-5" />
            <div className="text-center">BELUM DIBAYAR — invoice menyusul sesuai barang yang diterima.</div>
            <div className="mt-1.5 text-center">Terima kasih — Thank you</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
