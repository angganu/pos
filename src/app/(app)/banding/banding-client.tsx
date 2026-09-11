"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState, Chip } from "@/components/ui";
import { qs } from "@/lib/client";
import { rp, num, fdate } from "@/lib/format";

type Comparison = {
  item: { id: number; code: string; name: string; unit: string };
  monthlyQty: number;
  offers: {
    supplierId: number; supplier: string; supplierCode: string; terms: string | null;
    unitLabel: string; pricePerUnit: number; pricePerBase: number; lastPurchase: string;
    isCheapest: boolean; deltaPerBase: number; monthlyExtraCost: number;
  }[];
  highestSale: { price: number; customer: string; store: string; marginVsCheapest: number; spreadPerUnit: number } | null;
};

export default function BandingClient() {
  const [itemId, setItemId] = useState<number | null>(null);
  const { data: items } = useFetch<{ id: number; code: string; name: string }[]>("/api/items");
  const { data, loading } = useFetch<Comparison>(
    itemId ? `/api/reports/supplier-comparison${qs({ itemId })}` : null,
    [itemId]
  );

  useEffect(() => {
    if (!itemId && items?.length) setItemId(items[0].id);
  }, [items, itemId]);

  return (
    <div>
      <PageHeader
        kicker="Pembelian / Sourcing"
        title="Banding harga supplier"
        subtitle="Semua penawaran dikonversi ke satuan dasar agar bisa dibandingkan adil."
      />

      <div className="flex flex-wrap gap-2 px-6 pt-4">
        {(items ?? []).map((i) => (
          <Chip key={i.id} active={itemId === i.id} onClick={() => setItemId(i.id)}>
            {i.name}
          </Chip>
        ))}
      </div>

      {loading && <Loading />}

      {data && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 px-6 pb-10 pt-5">
          <div>
            <h4 className="mb-1 text-base">{data.item.name}</h4>
            <div className="mb-3.5 text-[13px] text-slate-7">
              {data.item.code} · satuan dasar {data.item.unit} · terjual {num(data.monthlyQty)} dalam 30 hari
            </div>

            {data.offers.length === 0 ? (
              <EmptyState title="Belum ada supplier yang pernah memasok barang ini." />
            ) : (
              <div className="table-wrap">
                <table className="tbl min-w-[600px]">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th className="w-[170px] text-right">Harga penawaran</th>
                      <th className="w-[140px] text-right">Per satuan dasar</th>
                      <th className="w-[190px] text-right">Selisih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.offers.map((o) => (
                      <tr key={o.supplierId} className={clsx(o.isCheapest && "bg-brand-100")}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={o.isCheapest ? "tag tag-accent" : "tag tag-neutral"}>
                              {o.isCheapest ? "PILIH INI" : "Alternatif"}
                            </span>
                            <span className="text-sm font-semibold">{o.supplier}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-7">
                            {o.supplierCode} · {o.terms ?? "—"} · terakhir {fdate(o.lastPurchase)}
                          </div>
                        </td>
                        <td className="text-right text-[13px]">
                          {rp(o.pricePerUnit)} <span className="text-slate-6">/ {o.unitLabel}</span>
                        </td>
                        <td className="text-right text-[15px] font-semibold">{rp(o.pricePerBase)}</td>
                        <td className="text-right">
                          <div className={clsx("text-[13px] font-semibold", o.isCheapest ? "text-teal-700" : "text-brand-600")}>
                            {o.isCheapest ? "Termurah" : `+ ${rp(o.deltaPerBase)}`}
                          </div>
                          <div className="text-[11px] text-slate-7">
                            {o.isCheapest ? "Acuan" : `Rugi ${rp(o.monthlyExtraCost)} / bulan`}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="max-w-[420px]">
            <h4 className="mb-3.5 text-base">Harga jual tertinggi</h4>
            {data.highestSale ? (
              <div className="bg-white p-5 ring-2 ring-ink">
                <div className="label-kicker mb-2 text-brand-600">Bisa dijual sampai</div>
                <div className="text-4xl font-extrabold leading-none">{rp(data.highestSale.price)}</div>
                <div className="mt-2.5 text-[13px] text-slate-8">
                  ke <strong>{data.highestSale.customer}</strong> di {data.highestSale.store} — margin{" "}
                  {(data.highestSale.marginVsCheapest * 100).toFixed(0)}% terhadap harga beli termurah.
                </div>
                <div className="my-3.5 h-0.5 bg-divider" />
                <div className="text-[13px] text-slate-8">
                  Selisih terbesar yang bisa diambil: <strong>{rp(data.highestSale.spreadPerUnit)}</strong> per{" "}
                  {data.item.unit.toLowerCase()}.
                </div>
                <button className="btn btn-primary mt-3.5 h-11 w-full justify-center">
                  Buat pesanan ke supplier termurah
                </button>
              </div>
            ) : (
              <EmptyState title="Belum ada harga jual terdaftar untuk barang ini." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
