"use client";

import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState } from "@/components/ui";
import { rp, fdate } from "@/lib/format";

type Row = {
  id: number; code: string; name: string; address: string | null; phone: string | null;
  pic: string | null; terms: string | null;
  purchaseCount: number; itemCount: number; totalValue: number; lastPurchase: string | null;
};

export default function SupplierClient() {
  const { data, loading } = useFetch<Row[]>("/api/suppliers");

  return (
    <div>
      <PageHeader
        kicker="Data induk / Master data"
        title="Supplier"
        subtitle="Harga penawaran terakhir dipakai di layar banding harga."
        actions={<button className="btn btn-primary h-11 px-4 text-[15px]">+ Tambah supplier</button>}
      />

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {(data ?? []).map((s) => (
              <div key={s.id} className="flex flex-col gap-2 bg-white p-4 ring-1 ring-divider">
                <div className="flex items-center justify-between gap-2.5">
                  <span className="label-kicker">{s.code}</span>
                  <span className={s.purchaseCount ? "tag tag-accent" : "tag tag-neutral"}>
                    {s.itemCount ? `memasok ${s.itemCount} barang` : "belum ada pembelian"}
                  </span>
                </div>
                <div className="text-lg font-extrabold leading-tight">{s.name}</div>
                <div className="text-[13px] text-slate-8">{s.address ?? "—"}</div>
                <div className="text-[13px] text-slate-8">
                  {[s.pic, s.phone, s.terms].filter(Boolean).join(" · ") || "—"}
                </div>
                <div className="my-0.5 h-px bg-divider" />
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-7">
                    {s.purchaseCount} faktur · terakhir {fdate(s.lastPurchase)}
                  </span>
                  <span className="text-lg font-extrabold">{rp(s.totalValue)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && (data?.length ?? 0) === 0 && <EmptyState title="Belum ada supplier." />}
      </div>
    </div>
  );
}
