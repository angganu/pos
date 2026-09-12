"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { rp, num } from "@/lib/format";

type Matrix = {
  item: { id: number; code: string; name: string; unit: string; unitCode: string; category: string; cost: number };
  stores: { id: number; code: string; name: string; stock: number }[];
  customers: { id: number; code: string; name: string; tier: string }[];
  cells: { storeId: number; customerId: number | null; price: number }[];
};

export default function HargaClient() {
  const params = useSearchParams();
  const initialItem = params.get("itemId");

  const [itemId, setItemId] = useState<number | null>(initialItem ? Number(initialItem) : null);
  const [edits, setEdits] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: items } = useFetch<{ id: number; code: string; name: string }[]>("/api/items");
  const { data, loading, refresh } = useFetch<Matrix>(itemId ? `/api/prices${qs({ itemId })}` : null, [itemId]);

  useEffect(() => {
    if (!itemId && items?.length) setItemId(items[0].id);
  }, [items, itemId]);

  useEffect(() => setEdits({}), [itemId]);

  const key = (storeId: number, customerId: number | null) => `${storeId}|${customerId ?? "null"}`;

  function cellValue(storeId: number, customerId: number | null): number | null {
    const k = key(storeId, customerId);
    if (k in edits) return edits[k];
    const found = data?.cells.find((c) => c.storeId === storeId && c.customerId === customerId);
    return found ? found.price : null;
  }

  async function save() {
    if (!itemId || !Object.keys(edits).length) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.put("/api/prices", {
        itemId,
        cells: Object.entries(edits).map(([k, price]) => {
          const [storeId, customerId] = k.split("|");
          return {
            storeId: Number(storeId),
            customerId: customerId === "null" ? null : Number(customerId),
            price,
          };
        }),
      });
      setMsg("Harga tersimpan.");
      setEdits({});
      refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal menyimpan harga.");
    } finally {
      setBusy(false);
    }
  }

  function copyFromFirstStore() {
    if (!data) return;
    const source = data.stores[0];
    if (!source) return;
    const next = { ...edits };
    for (const s of data.stores.slice(1)) {
      next[key(s.id, null)] = cellValue(source.id, null) ?? 0;
      for (const c of data.customers) {
        const v = cellValue(source.id, c.id);
        if (v !== null) next[key(s.id, c.id)] = v;
      }
    }
    setEdits(next);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-wrap items-stretch">
      {/* Item picker */}
      <div className="max-h-full min-w-[200px] flex-[0_1_240px] self-start overflow-y-auto border-r-2 border-divider">
        <div className="label-kicker border-b-2 border-divider px-4 py-3.5">Pilih barang</div>
        <div className="flex flex-col">
          {(items ?? []).map((i) => (
            <button
              key={i.id}
              onClick={() => setItemId(i.id)}
              className={clsx(
                "border-b border-divider px-4 py-2.5 text-left text-[13px] font-semibold transition-colors",
                itemId === i.id ? "bg-ink text-white" : "hover:bg-slate-2"
              )}
            >
              <div>{i.name}</div>
              <div className={clsx("text-[11px] font-normal", itemId === i.id ? "opacity-65" : "text-slate-6")}>
                {i.code}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Matrix */}
      <div className="min-w-0 flex-[1_1_520px]">
        {loading && <Loading />}
        {!loading && !data && <EmptyState title="Pilih satu barang di sebelah kiri." />}
        {data && (
          <>
            <PageHeader
              kicker="Matriks harga / Price matrix"
              title={data.item.name}
              subtitle={
                <>
                  {data.item.code} · {data.item.category} · satuan dasar <strong>{data.item.unit}</strong> · HPP{" "}
                  {rp(data.item.cost)} / {data.item.unitCode === "GR" ? "g" : "pcs"}
                </>
              }
              actions={
                <>
                  <button className="btn btn-secondary h-10" onClick={copyFromFirstStore}>
                    Salin harga toko pertama
                  </button>
                  <button className="btn btn-primary h-10" onClick={save} disabled={busy || !Object.keys(edits).length}>
                    {busy ? "Menyimpan…" : "Simpan harga"}
                  </button>
                </>
              }
            />

            {msg && (
              <div className="mx-6 mt-4 bg-teal-200 px-4 py-2.5 text-sm font-semibold text-teal-700">{msg}</div>
            )}

            <div className="px-6 py-4">
              <p className="mb-3 max-w-[80ch] text-[13px] text-slate-7">
                Satu baris = satu pelanggan (baris pertama harga umum). Setiap kolom adalah satu toko —
                kosongkan sel member agar mengikuti harga umum toko itu.
              </p>

              <div className="table-wrap">
                <table className="tbl min-w-[900px]">
                  <thead>
                    <tr>
                      <th className="w-[170px]">Pelanggan</th>
                      {data.stores.map((s) => (
                        <th key={s.id} className="w-[150px] text-right">
                          <div className="normal-case tracking-normal text-[13px] font-bold text-ink">{s.name}</div>
                          <div className="normal-case tracking-normal text-[10px] font-normal text-slate-6">
                            {s.code} · stok {num(s.stock)} {data.item.unitCode === "GR" ? "g" : "pcs"}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <div className="text-sm font-semibold">Harga umum</div>
                        <div className="text-[11px] text-slate-7">Pelanggan tanpa member</div>
                      </td>
                      {data.stores.map((s) => {
                        const general = cellValue(s.id, null) ?? 0;
                        const margin = general ? ((general - data.item.cost) / general) * 100 : 0;
                        return (
                          <td key={s.id}>
                            <input
                              inputMode="numeric"
                              className="input h-9 text-right font-semibold"
                              value={general ? num(general) : ""}
                              onChange={(e) =>
                                setEdits((p) => ({
                                  ...p,
                                  [key(s.id, null)]: Number(e.target.value.replace(/\D/g, "")) || 0,
                                }))
                              }
                            />
                            <div
                              className={clsx(
                                "mt-1 text-right text-[11px] font-semibold",
                                margin < 15 ? "text-amber-700" : "text-slate-7"
                              )}
                            >
                              margin {margin.toFixed(0)}%
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    {data.customers.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="text-sm font-semibold">{c.name}</div>
                          <div className="text-[11px] text-slate-7">{c.tier}</div>
                        </td>
                        {data.stores.map((s) => {
                          const v = cellValue(s.id, c.id);
                          return (
                            <td key={s.id}>
                              <input
                                inputMode="numeric"
                                className={clsx("input h-9 text-right", v !== null && "font-semibold text-brand-700")}
                                placeholder="ikut umum"
                                value={v !== null ? num(v) : ""}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/\D/g, "");
                                  setEdits((p) => ({ ...p, [key(s.id, c.id)]: raw === "" ? null : Number(raw) }));
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
