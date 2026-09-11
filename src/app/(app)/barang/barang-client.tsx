"use client";

import { useState } from "react";
import clsx from "clsx";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, Chip, EmptyState } from "@/components/ui";
import { qs } from "@/lib/client";
import { rp, num } from "@/lib/format";
import Link from "next/link";

type ItemRow = {
  id: number; code: string; name: string;
  category: { id: number; name: string };
  baseUnit: { code: string; name: string };
  stockByStore: { storeId: number; stock: number; minStock: number }[];
  priceMin: number; priceMax: number; memberPriceCount: number;
};

export default function BarangClient() {
  const { stores } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<number | null>(null);

  const { data: categories } = useFetch<{ id: number; name: string; itemCount: number }[]>("/api/categories");
  const { data: items, loading } = useFetch<ItemRow[]>(`/api/items${qs({ q, categoryId: cat })}`, [q, cat]);

  return (
    <div>
      <PageHeader
        kicker="Data induk / Master data"
        title="Barang"
        subtitle={`${items?.length ?? 0} barang terdaftar · harga & stok ditampilkan per toko`}
        actions={<button className="btn btn-primary h-11 px-4 text-[15px]">+ Tambah barang</button>}
      />

      <div className="flex flex-wrap items-center gap-2.5 px-6 pt-4">
        <input
          className="input h-11 max-w-[340px] text-[15px]"
          placeholder="Cari nama atau kode barang…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Chip active={cat === null} onClick={() => setCat(null)}>Semua</Chip>
        {(categories ?? []).map((c) => (
          <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="tbl min-w-[900px]">
              <thead>
                <tr>
                  <th>Nama / Kode</th>
                  <th className="w-[150px]">Kategori</th>
                  <th className="w-[110px]">Satuan dasar</th>
                  {stores.map((s) => (
                    <th key={s.id} className="w-[100px] text-right">{s.code}</th>
                  ))}
                  <th className="w-[180px] text-right">Harga umum</th>
                  <th className="w-[90px]" />
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((it) => (
                  <tr key={it.id}>
                    <td>
                      <div className="text-sm font-semibold">{it.name}</div>
                      <div className="text-[11px] text-slate-7">{it.code}</div>
                    </td>
                    <td className="text-[13px]">{it.category.name}</td>
                    <td className="text-[13px]">{it.baseUnit.name}</td>
                    {stores.map((s) => {
                      const row = it.stockByStore.find((x) => x.storeId === s.id);
                      const stock = row?.stock ?? 0;
                      const low = stock < (row?.minStock ?? 0);
                      return (
                        <td key={s.id} className={clsx("text-right text-[13px]", low && "font-semibold text-brand-600")}>
                          {num(stock)}
                        </td>
                      );
                    })}
                    <td className="text-right">
                      <div className="text-sm font-semibold">
                        {it.priceMin === it.priceMax ? rp(it.priceMin) : `${rp(it.priceMin)} – ${rp(it.priceMax)}`}
                      </div>
                      <div className="text-[11px] text-slate-7">
                        {it.memberPriceCount ? `${it.memberPriceCount} harga member` : "umum saja"}
                      </div>
                    </td>
                    <td className="text-right">
                      <Link href={`/harga?itemId=${it.id}`} className="btn btn-ghost text-xs no-underline">
                        Harga ›
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(items?.length ?? 0) === 0 && <EmptyState title="Tidak ada barang yang cocok." />}
          </div>
        )}
      </div>
    </div>
  );
}
