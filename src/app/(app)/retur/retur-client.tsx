"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState, SearchSelect } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { rp, num, fdatetime } from "@/lib/format";

type SaleLookup = {
  id: number; code: string; date: string; store: string; customer: string; total: number;
  lines: {
    itemId: number; name: string; code: string; unit: string;
    qty: number; returnedQty: number; returnableQty: number; unitPrice: number; total: number;
  }[];
};

export default function ReturClient() {
  const { storeId, user, stores } = useApp();
  const activeStoreId = storeId ?? user.storeId ?? stores[0]?.id ?? null;

  const [mode, setMode] = useState<"SALE" | "PURCHASE">("SALE");
  const [code, setCode] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("Barang rusak / kadaluarsa");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { data: sale, loading, error } = useFetch<SaleLookup>(
    query ? `/api/returns${qs({ saleCode: query, storeId: activeStoreId })}` : null,
    [query, activeStoreId]
  );
  const { data: history, refresh } = useFetch<
    { id: number; code: string; type: string; date: string; reference: string; reason: string | null; total: number }[]
  >(`/api/returns${qs({ storeId: activeStoreId })}`, [activeStoreId]);

  const refund = useMemo(() => {
    if (!sale) return 0;
    return sale.lines.reduce((a, l) => a + (selected[l.itemId] ?? 0) * l.unitPrice, 0);
  }, [sale, selected]);

  const count = Object.values(selected).filter((v) => v > 0).length;

  async function submit() {
    if (!activeStoreId || !sale || count === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ code: string }>("/api/returns", {
        type: mode, storeId: activeStoreId, saleId: mode === "SALE" ? sale.id : null,
        reason,
        lines: sale.lines
          .filter((l) => (selected[l.itemId] ?? 0) > 0)
          .map((l) => ({ itemId: l.itemId, qty: selected[l.itemId], price: l.unitPrice })),
      });
      setMsg({ kind: "ok", text: `Retur ${res.code} diproses. Stok sudah disesuaikan.` });
      setSelected({});
      setQuery(null);
      setCode("");
      refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal memproses retur." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Transaksi / Returns"
        title="Retur & refund"
        subtitle={
          mode === "SALE"
            ? "Uang dikembalikan ke pelanggan, stok bertambah"
            : "Barang dikirim balik ke supplier, stok berkurang"
        }
      />

      <div className="flex flex-wrap items-end gap-3 px-6 pt-4">
        <div className="flex h-11 ring-1 ring-divider">
          {(["SALE", "PURCHASE"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx("px-4 text-sm font-semibold transition-colors", mode === m ? "bg-ink text-white" : "bg-white hover:bg-slate-2")}
            >
              {m === "SALE" ? "Retur penjualan" : "Retur ke supplier"}
            </button>
          ))}
        </div>
        <div className="field min-w-[240px]">
          <label htmlFor="struk">Nomor struk / faktur</label>
          <input
            id="struk"
            className="input h-11 text-base font-semibold"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setQuery(code.trim())}
            placeholder="TRX-000123"
          />
        </div>
        <button className="btn btn-secondary h-11" onClick={() => setQuery(code.trim())}>
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
      {loading && <Loading label="Mencari struk…" />}

      {sale && (
        <div className="flex flex-wrap items-start gap-6 px-6 pb-10 pt-5">
          <div className="min-w-0 flex-[1_1_460px]">
            <div className="mb-2.5 text-[13px] text-slate-7">
              Struk {sale.code} · {fdatetime(sale.date)} · {sale.customer} · {sale.store}
            </div>
            <div className="table-wrap">
              <table className="tbl min-w-[600px]">
                <thead>
                  <tr>
                    <th className="w-[130px]">Qty retur</th>
                    <th>Barang</th>
                    <th className="w-[110px] text-right">Dibeli</th>
                    <th className="w-[120px] text-right">Harga</th>
                    <th className="w-[130px] text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.lines.map((l) => (
                    <tr key={l.itemId} className={clsx((selected[l.itemId] ?? 0) > 0 && "bg-brand-100")}>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={l.returnableQty}
                          step="any"
                          className="input h-9 text-right"
                          value={selected[l.itemId] ?? ""}
                          placeholder="0"
                          onChange={(e) =>
                            setSelected((s) => ({
                              ...s,
                              [l.itemId]: Math.min(Number(e.target.value) || 0, l.returnableQty),
                            }))
                          }
                          disabled={l.returnableQty <= 0}
                        />
                      </td>
                      <td>
                        <div className="text-sm font-semibold">{l.name}</div>
                        <div className="text-[11px] text-slate-7">
                          {l.code} · maks {num(l.returnableQty)} {l.unit}
                          {l.returnedQty > 0 && ` · sudah diretur ${num(l.returnedQty)}`}
                        </div>
                      </td>
                      <td className="text-right text-sm">{num(l.qty)} {l.unit}</td>
                      <td className="text-right text-[13px]">{rp(l.unitPrice)}</td>
                      <td className="text-right text-sm font-semibold">
                        {rp((selected[l.itemId] ?? 0) * l.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="min-w-[280px] flex-[0_1_340px] bg-white p-5 ring-2 ring-ink">
            <div className="label-kicker mb-2.5">Ringkasan retur</div>
            <div className="mb-2 flex justify-between text-sm">
              <span>Baris dipilih</span>
              <span className="font-semibold">{count}</span>
            </div>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="label-kicker">Uang kembali</span>
              <span className="text-3xl font-extrabold leading-none">{rp(refund)}</span>
            </div>
            <div className="field mb-3">
              <label htmlFor="reason">Alasan retur</label>
              <SearchSelect
                id="reason"
                className="input h-10"
                value={reason}
                onChange={setReason}
                options={["Barang rusak / kadaluarsa", "Salah barang", "Pelanggan batal", "Kelebihan kirim"].map((r) => ({
                  value: r,
                  label: r,
                }))}
              />
            </div>
            <button className="btn btn-primary h-12 w-full justify-center text-base" onClick={submit} disabled={busy || count === 0}>
              {busy ? "Memproses…" : "Proses retur & sesuaikan stok"}
            </button>
            <p className="mt-2.5 text-xs text-slate-7">
              Stok {mode === "SALE" ? "bertambah" : "berkurang"} otomatis di toko ini; laba periode berjalan ikut dikoreksi.
            </p>
          </div>
        </div>
      )}

      <div className="px-6 pb-10">
        <h4 className="mb-2.5 text-base">Riwayat retur</h4>
        <div className="table-wrap">
          <table className="tbl min-w-[700px]">
            <thead>
              <tr>
                <th className="w-[140px]">Nomor</th>
                <th className="w-[130px]">Jenis</th>
                <th className="w-[170px]">Tanggal</th>
                <th>Referensi</th>
                <th>Alasan</th>
                <th className="w-[130px] text-right">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.code}</td>
                  <td>
                    <span className={clsx("tag", r.type === "SALE" ? "tag-accent" : "tag-neutral")}>
                      {r.type === "SALE" ? "Penjualan" : "Ke supplier"}
                    </span>
                  </td>
                  <td className="text-[13px]">{fdatetime(r.date)}</td>
                  <td className="text-[13px]">{r.reference}</td>
                  <td className="text-[13px] text-slate-7">{r.reason ?? "—"}</td>
                  <td className="text-right text-sm font-semibold">{rp(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(history?.length ?? 0) === 0 && <EmptyState title="Belum ada retur tercatat." />}
        </div>
      </div>
    </div>
  );
}
