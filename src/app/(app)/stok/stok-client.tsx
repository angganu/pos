"use client";

import { useState } from "react";
import clsx from "clsx";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, StatCard, Loading, EmptyState } from "@/components/ui";
import { qs } from "@/lib/client";
import { rp, num } from "@/lib/format";

type StockData = {
  stores: { id: number; code: string; name: string }[];
  rows: {
    id: number; code: string; name: string; unit: string; unitCode: string;
    perStore: { storeId: number; storeCode: string; stock: number; minStock: number; low: boolean }[];
    total: number; cost: number; value: number; low: boolean;
  }[];
  totals: { value: number; lowCount: number; itemCount: number };
};

export default function StokClient() {
  const { storeId, store } = useApp();
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const { data, loading } = useFetch<StockData>(
    `/api/stock${qs({ storeId, q, lowOnly: lowOnly ? 1 : null })}`,
    [storeId, q, lowOnly]
  );

  return (
    <div>
      <PageHeader
        kicker="Persediaan / Inventory"
        title="Stok per toko"
        subtitle="Angka merah = di bawah stok minimum"
        actions={
          <>
            <button className="btn btn-secondary h-11">Ekspor Excel</button>
            <button className="btn btn-primary h-11 px-4 text-[15px]">Buat pesanan pembelian</button>
          </>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 px-6 pt-4">
        <StatCard
          label={store ? `Nilai persediaan · ${store.name}` : "Nilai persediaan semua toko"}
          value={rp(data?.totals.value ?? 0)}
          hint="dihitung dari harga beli rata-rata"
        />
        <StatCard label="Jenis barang" value={num(data?.totals.itemCount ?? 0)} hint="barang aktif" />
        <StatCard
          label="Perlu diorder"
          value={<span className="text-brand-600">{data?.totals.lowCount ?? 0} barang</span>}
          hint="stok di bawah minimum"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5 px-6 pt-4">
        <input
          className="input h-11 max-w-[340px] text-[15px]"
          placeholder="Cari barang…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Hanya yang perlu diorder
        </label>
      </div>

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="tbl min-w-[860px]">
              <thead>
                <tr>
                  <th>Barang</th>
                  <th className="w-[80px]">Satuan</th>
                  {(data?.stores ?? []).map((s) => (
                    <th key={s.id} className="w-[120px] text-right">{s.name}</th>
                  ))}
                  <th className="w-[110px] text-right">Total</th>
                  <th className="w-[140px] text-right">Nilai stok</th>
                  <th className="w-[110px] text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="text-sm font-semibold">{r.name}</div>
                      <div className="text-[11px] text-slate-7">{r.code}</div>
                    </td>
                    <td className="text-[13px]">{r.unit}</td>
                    {r.perStore.map((p) => (
                      <td key={p.storeId} className={clsx("text-right text-sm", p.low && "font-semibold text-brand-600")}>
                        {num(p.stock)}
                      </td>
                    ))}
                    <td className="text-right text-sm font-semibold">{num(r.total)}</td>
                    <td className="text-right text-sm">{rp(r.value)}</td>
                    <td className="text-right">
                      <span className={r.low ? "tag tag-accent" : "tag tag-neutral"}>
                        {r.low ? "Perlu order" : "Aman"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.rows.length ?? 0) === 0 && <EmptyState title="Tidak ada barang yang cocok." />}
          </div>
        )}
      </div>
    </div>
  );
}
