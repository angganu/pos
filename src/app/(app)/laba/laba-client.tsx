"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import clsx from "clsx";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, StatCard, Loading } from "@/components/ui";
import { qs } from "@/lib/client";
import { rp, num, fdate } from "@/lib/format";

type Profit = {
  kpi: { revenue: number; cogs: number; profit: number; margin: number; txCount: number; avgTicket: number; qtySold: number };
  stores: { storeId: number; code: string; name: string; revenue: number; cogs: number; profit: number; margin: number }[];
  items: { itemId: number; name: string; code: string; unit: string; qty: number; revenue: number; cogs: number; profit: number; margin: number; avgSellPrice: number; avgBuyPrice: number }[];
  periods: { key: string; label: string; revenue: number; cogs: number; profit: number }[];
};

type Members = {
  members: { rank: number; code: string; name: string; tier: string; txCount: number; totalSpend: number; avgSpend: number; lastPurchase: string | null }[];
  topItems: { rank: number; name: string; code: string; unit: string; qty: number; revenue: number }[];
};

const RANGES = [
  { id: "30", label: "30 hari", months: 0, days: 30 },
  { id: "6m", label: "6 bulan", months: 5, days: 0 },
  { id: "12m", label: "12 bulan", months: 11, days: 0 },
];

export default function LabaClient() {
  const { storeId, store } = useApp();
  const [range, setRange] = useState("6m");

  const from = (() => {
    const r = RANGES.find((x) => x.id === range)!;
    const d = new Date();
    if (r.days) d.setDate(d.getDate() - r.days);
    else { d.setMonth(d.getMonth() - r.months); d.setDate(1); }
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  const { data, loading } = useFetch<Profit>(`/api/reports/profit${qs({ storeId, from })}`, [storeId, range]);
  const { data: members } = useFetch<Members>(`/api/reports/top-members${qs({ storeId, from })}`, [storeId, range]);

  const maxProfit = Math.max(1, ...(data?.stores ?? []).map((s) => s.profit));
  const maxItemProfit = Math.max(1, ...(data?.items ?? []).map((i) => i.profit));

  return (
    <div>
      <PageHeader
        kicker="Laporan / Owner"
        title="Dasbor laba"
        subtitle={store ? `${store.name} · ${RANGES.find((r) => r.id === range)?.label}` : `Semua toko · ${RANGES.find((r) => r.id === range)?.label}`}
        actions={
          <div className="flex ring-1 ring-divider">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={clsx("px-3.5 py-2 text-sm font-semibold transition-colors", range === r.id ? "bg-ink text-white" : "bg-white hover:bg-slate-2")}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 px-6 pt-4">
            <StatCard
              label="Omzet penjualan"
              value={rp(data?.kpi.revenue ?? 0)}
              hint={`${num(data?.kpi.txCount ?? 0)} struk · rata-rata ${rp(data?.kpi.avgTicket ?? 0)}`}
            />
            <StatCard label="Harga beli (HPP)" value={rp(data?.kpi.cogs ?? 0)} hint={`${num(data?.kpi.qtySold ?? 0)} unit terjual`} />
            <StatCard emphasis label="Laba kotor" value={rp(data?.kpi.profit ?? 0)} hint="omzet dikurangi harga beli" />
            <StatCard
              label="Margin rata-rata"
              value={`${((data?.kpi.margin ?? 0) * 100).toFixed(0)}%`}
              hint="target internal 22%"
            />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-6 px-6 pt-7">
            <div>
              <h4 className="mb-3 text-base">Omzet & laba per periode</h4>
              <div className="h-[240px] w-full bg-white p-3 ring-1 ring-divider">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.periods ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d5dde7" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#798898" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#798898" tickFormatter={(v) => `${Math.round(v / 1e6)}jt`} />
                    <Tooltip formatter={(v: number) => rp(v)} contentStyle={{ fontSize: 12, borderRadius: 0 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" name="Omzet" fill="#b6c2d0" />
                    <Bar dataKey="profit" name="Laba kotor" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-base">Laba per toko</h4>
              <div className="flex flex-col gap-3.5">
                {(data?.stores ?? []).map((s) => (
                  <div key={s.storeId}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2.5">
                      <span className="text-sm font-semibold">{s.name}</span>
                      <span className="text-base font-extrabold">{rp(s.profit)}</span>
                    </div>
                    <div className="h-3.5 bg-slate-2">
                      <div className="h-3.5 bg-brand-600" style={{ width: `${(s.profit / maxProfit) * 100}%` }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-slate-7">
                      <span>omzet {rp(s.revenue)} · HPP {rp(s.cogs)}</span>
                      <span>margin {(s.margin * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-6 pt-8">
            <h4 className="mb-3 text-base">
              Laba per barang{" "}
              <span className="text-[13px] font-normal text-slate-7">— harga beli, harga jual, dan selisihnya</span>
            </h4>
            <div className="table-wrap">
              <table className="tbl min-w-[900px]">
                <thead>
                  <tr>
                    <th className="w-[40px]">#</th>
                    <th>Barang</th>
                    <th className="w-[130px] text-right">Terjual</th>
                    <th className="w-[130px] text-right">Rata harga jual</th>
                    <th className="w-[130px] text-right">Rata harga beli</th>
                    <th className="w-[140px] text-right">Omzet</th>
                    <th className="w-[140px] text-right">Laba</th>
                    <th className="w-[80px] text-right">Margin</th>
                    <th className="w-[110px]" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.items ?? []).map((r, i) => (
                    <tr key={r.itemId}>
                      <td className="text-[13px] text-slate-6">{i + 1}</td>
                      <td>
                        <div className="text-sm font-semibold">{r.name}</div>
                        <div className="text-[11px] text-slate-7">{r.code}</div>
                      </td>
                      <td className="text-right text-[13px]">{num(r.qty)} {r.unit}</td>
                      <td className="text-right text-[13px]">{rp(r.avgSellPrice)}</td>
                      <td className="text-right text-[13px] text-slate-7">{rp(r.avgBuyPrice)}</td>
                      <td className="text-right text-[13px]">{rp(r.revenue)}</td>
                      <td className="text-right text-sm font-semibold">{rp(r.profit)}</td>
                      <td className="text-right text-[13px]">{(r.margin * 100).toFixed(0)}%</td>
                      <td>
                        <div className="h-2 bg-slate-2">
                          <div className="h-2 bg-brand-600" style={{ width: `${Math.max(0, (r.profit / maxItemProfit) * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-6 px-6 pb-10 pt-8">
            <div>
              <h4 className="mb-3 text-base">Member dengan belanja terbanyak</h4>
              <div className="table-wrap">
                <table className="tbl min-w-[420px]">
                  <thead>
                    <tr>
                      <th className="w-[36px]">#</th>
                      <th>Member</th>
                      <th className="w-[80px] text-right">Trx</th>
                      <th className="w-[140px] text-right">Total belanja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(members?.members ?? []).map((m) => (
                      <tr key={m.code}>
                        <td className="text-[13px] text-slate-6">{m.rank}</td>
                        <td>
                          <div className="text-sm font-semibold">{m.name}</div>
                          <div className="text-[11px] text-slate-7">
                            {m.code} · {m.tier} · terakhir {fdate(m.lastPurchase)}
                          </div>
                        </td>
                        <td className="text-right text-[13px]">{m.txCount}</td>
                        <td className="text-right text-sm font-semibold">{rp(m.totalSpend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-base">Barang paling laku</h4>
              <div className="table-wrap">
                <table className="tbl min-w-[420px]">
                  <thead>
                    <tr>
                      <th className="w-[36px]">#</th>
                      <th>Barang</th>
                      <th className="w-[130px] text-right">Qty terjual</th>
                      <th className="w-[140px] text-right">Omzet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(members?.topItems ?? []).map((t) => (
                      <tr key={t.code}>
                        <td className="text-[13px] text-slate-6">{t.rank}</td>
                        <td>
                          <div className="text-sm font-semibold">{t.name}</div>
                          <div className="text-[11px] text-slate-7">{t.code}</div>
                        </td>
                        <td className="text-right text-[13px]">{num(t.qty)} {t.unit}</td>
                        <td className="text-right text-sm font-semibold">{rp(t.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
