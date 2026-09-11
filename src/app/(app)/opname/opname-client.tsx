"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { rp, num, fdate } from "@/lib/format";

type Sheet = {
  sheet: { itemId: number; code: string; name: string; unit: string; systemQty: number; cost: number }[];
  history: { id: number; code: string; date: string; status: string; user: string; lineCount: number }[];
};

export default function OpnameClient() {
  const { stores, storeId, user } = useApp();
  const activeStoreId = storeId ?? user.storeId ?? stores[0]?.id ?? null;

  const [tab, setTab] = useState<"transfer" | "opname">("transfer");
  const [counted, setCounted] = useState<Record<number, number>>({});
  const [fromStore, setFromStore] = useState<number | null>(activeStoreId);
  const [toStore, setToStore] = useState<number | null>(null);
  const [transferLines, setTransferLines] = useState<{ itemId: number; qty: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { data, loading, refresh } = useFetch<Sheet>(
    activeStoreId ? `/api/opname${qs({ storeId: activeStoreId })}` : null,
    [activeStoreId]
  );
  const { data: items } = useFetch<{ id: number; code: string; name: string; baseUnit: { name: string } }[]>("/api/items");

  const diffs = useMemo(() => {
    if (!data) return { rows: [], value: 0, count: 0 };
    const rows = data.sheet
      .filter((s) => counted[s.itemId] !== undefined)
      .map((s) => {
        const diff = counted[s.itemId] - s.systemQty;
        return { ...s, physical: counted[s.itemId], diff, value: Math.abs(diff) * s.cost };
      });
    return {
      rows,
      value: rows.reduce((a, r) => a + r.value, 0),
      count: rows.filter((r) => r.diff !== 0).length,
    };
  }, [data, counted]);

  async function postOpname() {
    if (!activeStoreId || diffs.rows.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ code: string }>("/api/opname", {
        storeId: activeStoreId,
        lines: diffs.rows.map((r) => ({ itemId: r.itemId, physicalQty: r.physical })),
      });
      setMsg({ kind: "ok", text: `Opname ${res.code} tersimpan. Stok sistem disesuaikan.` });
      setCounted({});
      refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan opname." });
    } finally {
      setBusy(false);
    }
  }

  async function postTransfer() {
    if (!fromStore || !toStore || transferLines.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ code: string }>("/api/transfers", {
        fromStoreId: fromStore, toStoreId: toStore,
        lines: transferLines.filter((l) => l.qty > 0),
      });
      setMsg({ kind: "ok", text: `Transfer ${res.code} terkirim. Stok kedua toko sudah diperbarui.` });
      setTransferLines([]);
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal mengirim transfer." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Persediaan / Inventory"
        title="Transfer & opname"
        subtitle="Pindah barang antar toko, dan cocokkan stok sistem dengan hitungan fisik."
      />

      <div className="flex gap-0 px-6 pt-4">
        {(["transfer", "opname"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-4 py-2.5 text-sm font-semibold ring-1 ring-divider transition-colors",
              tab === t ? "bg-ink text-white" : "bg-white hover:bg-slate-2"
            )}
          >
            {t === "transfer" ? "Transfer antar toko" : "Opname stok"}
          </button>
        ))}
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

      {tab === "transfer" && (
        <div className="px-6 pb-10 pt-5">
          <div className="mb-3.5 flex flex-wrap items-end gap-3">
            <div className="field min-w-[220px]">
              <label htmlFor="from">Dari toko</label>
              <select id="from" className="input h-10" value={fromStore ?? ""} onChange={(e) => setFromStore(Number(e.target.value))}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </select>
            </div>
            <div className="field min-w-[220px]">
              <label htmlFor="to">Ke toko</label>
              <select id="to" className="input h-10" value={toStore ?? ""} onChange={(e) => setToStore(Number(e.target.value))}>
                <option value="">Pilih toko tujuan…</option>
                {stores.filter((s) => s.id !== fromStore).map((s) => (
                  <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-secondary h-10"
              onClick={() => items?.[0] && setTransferLines((c) => [...c, { itemId: items[0].id, qty: 0 }])}
            >
              + Tambah barang
            </button>
            <button className="btn btn-primary h-10" onClick={postTransfer} disabled={busy || !toStore || !transferLines.length}>
              {busy ? "Mengirim…" : "Kirim & pindahkan stok"}
            </button>
          </div>

          <div className="table-wrap">
            <table className="tbl min-w-[700px]">
              <thead>
                <tr>
                  <th>Barang</th>
                  <th className="w-[180px] text-right">Jumlah pindah</th>
                  <th className="w-[60px]" />
                </tr>
              </thead>
              <tbody>
                {transferLines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        className="input h-9"
                        value={l.itemId}
                        onChange={(e) =>
                          setTransferLines((c) => c.map((x, idx) => (idx === i ? { ...x, itemId: Number(e.target.value) } : x)))
                        }
                      >
                        {(items ?? []).map((it) => <option key={it.id} value={it.id}>{it.code} · {it.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="input h-9 text-right"
                        value={l.qty || ""}
                        onChange={(e) =>
                          setTransferLines((c) => c.map((x, idx) => (idx === i ? { ...x, qty: Number(e.target.value) || 0 } : x)))
                        }
                      />
                    </td>
                    <td>
                      <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setTransferLines((c) => c.filter((_, idx) => idx !== i))}>
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
                {transferLines.length === 0 && (
                  <tr><td colSpan={3} className="py-8 text-center text-sm text-slate-6">Belum ada barang untuk dipindah.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "opname" && (
        <div className="px-6 pb-10 pt-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h4 className="mb-1 text-base">Opname stok — {stores.find((s) => s.id === activeStoreId)?.name ?? "—"}</h4>
              <div className="text-[13px] text-slate-7">
                {diffs.count} barang selisih · nilai selisih {rp(diffs.value)}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => window.print()}>Cetak lembar hitung</button>
              <button className="btn btn-primary" onClick={postOpname} disabled={busy || diffs.rows.length === 0}>
                {busy ? "Menyimpan…" : "Sesuaikan stok sistem"}
              </button>
            </div>
          </div>

          {loading ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table className="tbl min-w-[800px]">
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th className="w-[70px]">Satuan</th>
                    <th className="w-[140px] text-right">Stok sistem</th>
                    <th className="w-[150px] text-right">Hitung fisik</th>
                    <th className="w-[120px] text-right">Selisih</th>
                    <th className="w-[140px] text-right">Nilai selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.sheet ?? []).map((s) => {
                    const physical = counted[s.itemId];
                    const diff = physical === undefined ? null : physical - s.systemQty;
                    return (
                      <tr key={s.itemId}>
                        <td>
                          <div className="text-sm font-semibold">{s.name}</div>
                          <div className="text-[11px] text-slate-7">{s.code}</div>
                        </td>
                        <td className="text-[13px]">{s.unit}</td>
                        <td className="text-right text-[13px] text-slate-7">{num(s.systemQty)}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className="input h-9 text-right font-semibold"
                            placeholder="belum dihitung"
                            value={physical ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCounted((c) => {
                                const next = { ...c };
                                if (v === "") delete next[s.itemId];
                                else next[s.itemId] = Number(v);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td
                          className={clsx(
                            "text-right text-[15px] font-semibold",
                            diff === null ? "text-slate-5" : diff === 0 ? "text-slate-6" : diff < 0 ? "text-brand-600" : "text-teal-700"
                          )}
                        >
                          {diff === null ? "—" : `${diff > 0 ? "+" : ""}${num(diff)}`}
                        </td>
                        <td className="text-right text-[13px]">
                          {diff === null ? "—" : rp(Math.abs(diff) * s.cost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(data?.history.length ?? 0) > 0 && (
            <div className="mt-8">
              <h4 className="mb-2.5 text-base">Riwayat opname</h4>
              <div className="table-wrap">
                <table className="tbl min-w-[600px]">
                  <thead>
                    <tr>
                      <th className="w-[140px]">Nomor</th>
                      <th className="w-[160px]">Tanggal</th>
                      <th>Petugas</th>
                      <th className="w-[110px] text-right">Baris</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.history ?? []).map((h) => (
                      <tr key={h.id}>
                        <td className="font-semibold">{h.code}</td>
                        <td className="text-[13px]">{fdate(h.date)}</td>
                        <td className="text-[13px]">{h.user}</td>
                        <td className="text-right text-[13px]">{h.lineCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
