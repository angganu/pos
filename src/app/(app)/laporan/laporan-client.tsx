"use client";

import { useState } from "react";
import { Download, Eye } from "lucide-react";
import { useApp } from "@/components/app-context";
import { PageHeader } from "@/components/ui";
import { qs } from "@/lib/client";

const REPORTS = [
  { id: "sales-daily", name: "Penjualan harian", desc: "Omzet, jumlah struk, rata-rata per struk — per toko per hari", period: "Harian", api: "/api/sales" },
  { id: "sales-item", name: "Penjualan per barang", desc: "Qty terjual, omzet, laba kotor per barang", period: "Bulanan", api: "/api/reports/profit" },
  { id: "profit-store", name: "Laba per toko", desc: "Omzet – HPP, margin, tren periode", period: "Bulanan", api: "/api/reports/profit" },
  { id: "stock-card", name: "Kartu stok", desc: "Mutasi masuk/keluar tiap barang per toko", period: "Sesuai filter", api: "/api/stock?card=1" },
  { id: "purchase-supplier", name: "Pembelian per supplier", desc: "Nilai pembelian, harga rata-rata, jatuh tempo", period: "Bulanan", api: "/api/purchases" },
  { id: "member-spend", name: "Belanja member", desc: "Peringkat member, total belanja, poin", period: "Bulanan", api: "/api/reports/top-members" },
  { id: "supplier-compare", name: "Banding supplier", desc: "Harga per satuan dasar dari tiap supplier", period: "Sesuai filter", api: "/api/reports/supplier-comparison" },
  { id: "shift", name: "Rekap shift kasir", desc: "Uang awal, penjualan tunai, selisih laci", period: "Per shift", api: "/api/shifts" },
];

/** Client-side CSV export — no server round trip, works on any report payload. */
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\n");
}

export default function LaporanClient() {
  const { storeId, stores } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);

  const [from, setFrom] = useState(monthStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; rows: Record<string, unknown>[] } | null>(null);

  async function run(report: (typeof REPORTS)[number], download: boolean) {
    setBusy(report.id);
    try {
      const url = `${report.api}${report.api.includes("?") ? "&" : ""}${qs({ storeId, from, to }).replace(/^\?/, report.api.includes("?") ? "" : "?")}`;
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);

      // Flatten whatever shape the endpoint returned into rows.
      const d = body.data;
      const rows: Record<string, unknown>[] = Array.isArray(d)
        ? d
        : Array.isArray(d?.rows) ? d.rows
        : Array.isArray(d?.items) ? d.items
        : Array.isArray(d?.members) ? d.members
        : Array.isArray(d?.history) ? d.history
        : Array.isArray(d?.offers) ? d.offers
        : [d];

      if (download) {
        const csv = toCsv(rows);
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${report.id}_${from}_${to}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        setPreview({ name: report.name, rows: rows.slice(0, 50) });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal memuat laporan.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Laporan / Reports"
        title="Laporan & ekspor"
        subtitle="Pilih rentang tanggal dan toko, lalu lihat atau unduh sebagai CSV (bisa dibuka di Excel)."
      />

      <div className="flex flex-wrap items-end gap-3 px-6 pt-4">
        <div className="field min-w-[150px]">
          <label htmlFor="from">Dari tanggal</label>
          <input id="from" type="date" className="input h-10" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field min-w-[150px]">
          <label htmlFor="to">Sampai tanggal</label>
          <input id="to" type="date" className="input h-10" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="text-[13px] text-slate-7">
          Toko: <strong>{stores.find((s) => s.id === storeId)?.name ?? "Semua toko"}</strong> — ganti di bar atas.
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 px-6 pb-10 pt-5">
        {REPORTS.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 bg-white p-4 ring-1 ring-divider">
            <div className="label-kicker">{r.period}</div>
            <div className="text-lg font-extrabold leading-tight">{r.name}</div>
            <div className="flex-1 text-[13px] text-slate-8">{r.desc}</div>
            <div className="mt-1 flex gap-2">
              <button className="btn btn-secondary flex-1 justify-center" onClick={() => run(r, false)} disabled={busy === r.id}>
                <Eye size={14} /> Lihat
              </button>
              <button className="btn btn-primary flex-1 justify-center" onClick={() => run(r, true)} disabled={busy === r.id}>
                <Download size={14} /> Unduh
              </button>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setPreview(null)}>
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-none items-center justify-between border-b-2 border-divider px-5 py-3.5">
              <span className="text-lg font-extrabold">{preview.name}</span>
              <button className="btn btn-secondary" onClick={() => setPreview(null)}>Tutup</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {preview.rows.length === 0 ? (
                <p className="text-sm text-slate-6">Tidak ada data pada rentang ini.</p>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>{Object.keys(preview.rows[0]).map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i}>
                        {Object.keys(preview.rows[0]).map((c) => (
                          <td key={c} className="whitespace-nowrap text-[13px]">
                            {typeof row[c] === "object" ? JSON.stringify(row[c]) : String(row[c] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
