"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState, SearchSelect } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { rp, num, pct, fdatetime } from "@/lib/format";

type PurchaseLookup = {
  id: number; code: string; date: string; store: string; supplier: string;
  lines: {
    purchaseLineId: number; itemId: number; name: string; code: string;
    unit: string; unitLabel: string; factor: number; qty: number; baseQty: number; unitCost: number;
    rejectedQty: number; stock: number; rejectableQty: number;
  }[];
};

type RejectRow = {
  id: number; code: string; date: string; purchaseCode: string; supplier: string;
  store: string; user: string; reason: string | null; total: number;
  lines: { name: string; qty: number; unit: string; unitLabel: string; factor: number }[];
};

/** Reject qty is typed in the unit it was bought in ("buy") or in the stock unit ("base"). */
type Mode = "buy" | "base";

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

type SupplierRow = {
  supplierId: number; code: string; name: string;
  purchaseCount: number; purchaseValue: number;
  rejectCount: number; rejectValue: number; rejectRate: number;
};

const REASONS = ["Rusak saat diterima", "Kadaluarsa", "Busuk / basi", "Pecah / bocor", "Cacat produksi"];

function rateTag(rate: number) {
  if (rate < 0.02) return "tag-teal";
  if (rate < 0.05) return "tag-amber";
  return "tag-accent";
}

export default function RejectClient() {
  // null = all stores (owners/admins); store-pinned roles are scoped by the server anyway.
  const { storeId } = useApp();

  const [code, setCode] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  /** Reject qty per purchase line, always in base (stock) units. */
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [mode, setMode] = useState<Record<number, Mode>>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { data: purchase, loading, error } = useFetch<PurchaseLookup>(
    query ? `/api/rejects${qs({ purchaseCode: query, storeId })}` : null,
    [query, storeId]
  );
  const { data: history, refresh: refreshHistory } = useFetch<RejectRow[]>(`/api/rejects${qs({ storeId })}`, [storeId]);
  const { data: suppliers, refresh: refreshSuppliers } = useFetch<SupplierRow[]>(
    `/api/rejects${qs({ summary: 1, storeId })}`,
    [storeId]
  );

  const loss = useMemo(() => {
    if (!purchase) return 0;
    return purchase.lines.reduce((a, l) => a + (selected[l.purchaseLineId] ?? 0) * l.unitCost, 0);
  }, [purchase, selected]);

  const count = Object.values(selected).filter((v) => v > 0).length;

  function lookup() {
    setSelected({});
    setMode({});
    setMsg(null);
    setQuery(code.trim() || null);
  }

  async function submit() {
    if (!purchase || count === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ code: string }>("/api/rejects", {
        purchaseId: purchase.id,
        reason,
        lines: purchase.lines
          .filter((l) => (selected[l.purchaseLineId] ?? 0) > 0)
          .map((l) => ({ purchaseLineId: l.purchaseLineId, qty: selected[l.purchaseLineId] })),
      });
      setMsg({ kind: "ok", text: `Reject ${res.code} disimpan. Stok sudah dikurangi.` });
      setSelected({});
      setQuery(null);
      setCode("");
      refreshHistory();
      refreshSuppliers();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan reject." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Transaksi / Rejects"
        title="Reject barang"
        subtitle="Barang rusak dari pembelian dikeluarkan dari stok — tidak dijual, tidak diretur"
      />

      <div className="flex flex-wrap items-end gap-3 px-6 pt-4">
        <div className="field min-w-[260px]">
          <label htmlFor="faktur">Nomor faktur pembelian</label>
          <input
            id="faktur"
            className="input h-11 text-base font-semibold"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="PB-2610-0001"
          />
        </div>
        <button className="btn btn-secondary h-11" onClick={lookup}>
          Cari
        </button>
      </div>

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
      {error && <div className="mx-6 mt-4 bg-brand-100 px-4 py-3 text-sm font-semibold text-brand-800">{error}</div>}
      {loading && <Loading label="Mencari faktur…" />}

      {purchase && (
        <div className="flex flex-wrap items-start gap-6 px-6 pb-10 pt-5">
          <div className="min-w-0 flex-[1_1_520px]">
            <div className="mb-2.5 text-[13px] text-slate-7">
              Faktur {purchase.code} · {fdatetime(purchase.date)} · {purchase.supplier} · {purchase.store}
            </div>
            <div className="table-wrap">
              <table className="tbl min-w-[720px]">
                <thead>
                  <tr>
                    <th className="w-[210px]">Qty reject</th>
                    <th>Barang</th>
                    <th className="w-[130px] text-right">Dibeli</th>
                    <th className="w-[100px] text-right">Stok</th>
                    <th className="w-[120px] text-right">Harga pokok</th>
                    <th className="w-[120px] text-right">Nilai reject</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.lines.map((l) => {
                    const id = l.purchaseLineId;
                    const m = l.factor !== 1 ? (mode[id] ?? "buy") : "base";
                    const f = m === "buy" ? l.factor : 1;
                    const base = selected[id] ?? 0;
                    return (
                      <tr key={id} className={clsx(base > 0 && "bg-brand-100")}>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={round4(l.rejectableQty / f)}
                              step="any"
                              aria-label={`Qty reject ${l.name}`}
                              className="input h-9 w-[90px] text-right"
                              value={selected[id] === undefined ? "" : round4(base / f)}
                              placeholder="0"
                              onChange={(e) =>
                                setSelected((s) => ({
                                  ...s,
                                  [id]: Math.max(0, Math.min(round4((Number(e.target.value) || 0) * f), l.rejectableQty)),
                                }))
                              }
                              disabled={l.rejectableQty <= 0}
                            />
                            {l.factor !== 1 ? (
                              <select
                                aria-label={`Satuan reject ${l.name}`}
                                className="input h-9 w-auto px-1.5 text-[12px]"
                                value={m}
                                onChange={(e) => setMode((s) => ({ ...s, [id]: e.target.value as Mode }))}
                              >
                                <option value="buy">{l.unitLabel}</option>
                                <option value="base">{l.unit}</option>
                              </select>
                            ) : (
                              <span className="text-[12px] text-slate-7">{l.unit}</span>
                            )}
                          </div>
                          {m === "buy" && base > 0 && (
                            <div className="mt-1 text-[11px] text-slate-7">= {num(base)} {l.unit}</div>
                          )}
                        </td>
                        <td>
                          <div className="text-sm font-semibold">{l.name}</div>
                          <div className="text-[11px] text-slate-7">
                            {l.code} · maks {num(round4(l.rejectableQty / f))} {m === "buy" ? l.unitLabel : l.unit}
                            {l.rejectedQty > 0 && ` · sudah di-reject ${num(l.rejectedQty)} ${l.unit}`}
                          </div>
                        </td>
                        <td className="text-right text-sm">
                          <div>{num(l.qty)} {l.unitLabel}</div>
                          {l.factor !== 1 && (
                            <div className="text-[11px] text-slate-7">= {num(l.baseQty)} {l.unit}</div>
                          )}
                        </td>
                        <td className="text-right text-sm">{num(l.stock)} {l.unit}</td>
                        <td className="text-right text-[13px]">{rp(l.unitCost)}</td>
                        <td className="text-right text-sm font-semibold">{rp(base * l.unitCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="min-w-[280px] flex-[0_1_340px] bg-white p-5 ring-2 ring-ink">
            <div className="label-kicker mb-2.5">Ringkasan reject</div>
            <div className="mb-2 flex justify-between text-sm">
              <span>Baris dipilih</span>
              <span className="font-semibold">{count}</span>
            </div>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="label-kicker">Nilai kerugian</span>
              <span className="text-3xl font-extrabold leading-none">{rp(loss)}</span>
            </div>
            <div className="field mb-3">
              <label htmlFor="reason">Alasan reject</label>
              <SearchSelect
                id="reason"
                className="input h-10"
                value={reason}
                onChange={setReason}
                options={REASONS.map((r) => ({ value: r, label: r }))}
              />
            </div>
            <button className="btn btn-primary h-12 w-full justify-center text-base" onClick={submit} disabled={busy || count === 0}>
              {busy ? "Menyimpan…" : "Simpan reject & kurangi stok"}
            </button>
            <p className="mt-2.5 text-xs text-slate-7">
              Stok toko ini berkurang permanen dan tercatat di kartu stok sebagai REJECT.
            </p>
          </div>
        </div>
      )}

      <div className="px-6 pb-10">
        <h4 className="mb-2.5 text-base">Riwayat reject</h4>
        <div className="table-wrap">
          <table className="tbl min-w-[860px]">
            <thead>
              <tr>
                <th className="w-[140px]">Nomor</th>
                <th className="w-[170px]">Tanggal</th>
                <th className="w-[170px]">Faktur</th>
                <th>Barang</th>
                <th className="w-[170px]">Alasan</th>
                <th className="w-[130px] text-right">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.code}</td>
                  <td className="text-[13px]">
                    <div>{fdatetime(r.date)}</div>
                    <div className="text-[11px] text-slate-7">{r.user}</div>
                  </td>
                  <td className="text-[13px]">
                    <div className="font-semibold">{r.purchaseCode}</div>
                    <div className="text-[11px] text-slate-7">{r.supplier} · {r.store}</div>
                  </td>
                  <td className="text-[13px]">
                    {r.lines
                      .map((l) =>
                        l.factor !== 1
                          ? `${l.name} ${num(round4(l.qty / l.factor))} ${l.unitLabel} (${num(l.qty)} ${l.unit})`
                          : `${l.name} ${num(l.qty)} ${l.unit}`
                      )
                      .join(", ")}
                  </td>
                  <td className="text-[13px] text-slate-7">{r.reason ?? "—"}</td>
                  <td className="text-right text-sm font-semibold">{rp(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(history?.length ?? 0) === 0 && <EmptyState title="Belum ada reject tercatat." />}
        </div>
      </div>

      <div className="px-6 pb-10">
        <h4 className="mb-1 text-base">Kualitas supplier</h4>
        <p className="mb-2.5 text-[13px] text-slate-7">
          Nilai barang reject dibanding nilai pembelian. Makin kecil rasionya, makin baik suppliernya.
        </p>
        <div className="table-wrap">
          <table className="tbl min-w-[760px]">
            <thead>
              <tr>
                <th className="w-[50px]">#</th>
                <th>Supplier</th>
                <th className="w-[90px] text-right">Faktur</th>
                <th className="w-[150px] text-right">Nilai beli</th>
                <th className="w-[90px] text-right">Reject</th>
                <th className="w-[150px] text-right">Nilai reject</th>
                <th className="w-[110px] text-right">Rasio</th>
              </tr>
            </thead>
            <tbody>
              {(suppliers ?? []).map((s, i) => (
                <tr key={s.supplierId}>
                  <td className="text-[13px] text-slate-7">{i + 1}</td>
                  <td>
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-[11px] text-slate-7">{s.code}</div>
                  </td>
                  <td className="text-right text-sm">{num(s.purchaseCount)}</td>
                  <td className="text-right text-sm">{rp(s.purchaseValue)}</td>
                  <td className="text-right text-sm">{num(s.rejectCount)}</td>
                  <td className="text-right text-sm">{rp(s.rejectValue)}</td>
                  <td className="text-right">
                    <span className={clsx("tag", rateTag(s.rejectRate))}>{pct(s.rejectRate, 1)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(suppliers?.length ?? 0) === 0 && <EmptyState title="Belum ada pembelian dari supplier." />}
        </div>
      </div>
    </div>
  );
}
