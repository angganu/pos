"use client";

import { useState } from "react";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState } from "@/components/ui";
import { qs } from "@/lib/client";
import { rp, num, fdate, initials } from "@/lib/format";

type Row = {
  id: number; code: string; name: string; address: string | null; phone: string | null;
  tier: string; points: number; txCount: number; specialPriceCount: number;
  totalSpend: number; avgSpend: number; lastPurchase: string | null;
};

export default function PelangganClient() {
  const [q, setQ] = useState("");
  const { data, loading } = useFetch<Row[]>(`/api/customers${qs({ q })}`, [q]);

  return (
    <div>
      <PageHeader
        kicker="Data induk / Master data"
        title="Pelanggan & member"
        subtitle="Member bisa punya harga khusus per barang, per toko."
        actions={<button className="btn btn-primary h-11 px-4 text-[15px]">+ Tambah member</button>}
      />

      <div className="px-6 pt-4">
        <input
          className="input h-11 max-w-[340px] text-[15px]"
          placeholder="Cari nama, kode, atau telepon…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="tbl min-w-[940px]">
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="w-[110px]">Tingkat</th>
                  <th className="w-[150px]">Telepon</th>
                  <th className="w-[220px]">Alamat</th>
                  <th className="w-[90px] text-right">Poin</th>
                  <th className="w-[80px] text-right">Trx</th>
                  <th className="w-[150px] text-right">Total belanja</th>
                  <th className="w-[140px] text-right">Harga khusus</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center bg-slate-3 text-xs font-extrabold text-slate-8">
                          {initials(c.name)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{c.name}</div>
                          <div className="text-[11px] text-slate-7">
                            {c.code} · terakhir {fdate(c.lastPurchase)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><span className="tag tag-violet">{c.tier}</span></td>
                    <td className="text-[13px]">{c.phone ?? "—"}</td>
                    <td className="text-[13px] text-slate-8">{c.address ?? "—"}</td>
                    <td className="text-right text-[13px]">{num(c.points)}</td>
                    <td className="text-right text-[13px]">{c.txCount}</td>
                    <td className="text-right text-[15px] font-semibold">{rp(c.totalSpend)}</td>
                    <td className="text-right">
                      <span className={c.specialPriceCount ? "tag tag-accent" : "tag tag-neutral"}>
                        {c.specialPriceCount ? `${c.specialPriceCount} harga khusus` : "harga umum"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.length ?? 0) === 0 && <EmptyState title="Belum ada member terdaftar." />}
          </div>
        )}
      </div>
    </div>
  );
}
