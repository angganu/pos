"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { format } from "date-fns";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState, SearchSelect } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { rp, num, fdatetime } from "@/lib/format";
import { mergeLines, noteKey, type DeliveryLine } from "@/lib/delivery";

type Customer = { id: number; code: string; name: string; address: string | null; phone: string | null };

type PendingOrder = {
  id: number; code: string; date: string; total: number;
  customer: Customer | null; lines: DeliveryLine[];
};

type Vehicle = {
  id: number; vehicleNo: string; vehicleType: string;
  driver: string | null; driverAssistance: string | null; active: boolean;
};

const WALK_IN = "Pelanggan Umum";

export default function PengirimanClient() {
  // POs are picked from one store at a time.
  const { storeId, store } = useApp();

  const { data: pending, loading, error, refresh: refreshPending } = useFetch<PendingOrder[]>(
    storeId ? `/api/deliveries${qs({ pending: 1, storeId })}` : null,
    [storeId]
  );
  const { data: vehicles } = useFetch<Vehicle[]>("/api/vehicles");

  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; deliveryId?: number } | null>(null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (pending ?? []).filter(
      (o) => !needle || [o.code, o.customer?.name ?? WALK_IN].some((v) => v.toLowerCase().includes(needle))
    );
  }, [pending, q]);

  const selected = useMemo(() => (pending ?? []).filter((o) => picked.has(o.id)), [pending, picked]);

  /** The surat jalan this delivery will produce, grouped exactly as the server will. */
  const notes = useMemo(() => {
    const groups = new Map<string, { key: string; customer: Customer | null; orders: PendingOrder[] }>();
    for (const o of selected) {
      const key = noteKey({ id: o.id, customerId: o.customer?.id ?? null });
      const g = groups.get(key) ?? { key, customer: o.customer, orders: [] };
      g.orders.push(o);
      groups.set(key, g);
    }
    return [...groups.values()].map((g) => ({ ...g, items: mergeLines(g.orders) }));
  }, [selected]);

  const activeVehicles = (vehicles ?? []).filter((v) => v.active);
  const vehicle = activeVehicles.find((v) => String(v.id) === vehicleId) ?? null;
  const allVisiblePicked = visible.length > 0 && visible.every((o) => picked.has(o.id));

  function toggle(id: number) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setPicked((p) => {
      const next = new Set(p);
      for (const o of visible) {
        if (allVisiblePicked) next.delete(o.id);
        else next.add(o.id);
      }
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ id: number; code: string; noteCount: number }>("/api/deliveries", {
        orderIds: selected.map((o) => o.id),
        vehicleId: Number(vehicleId),
        date,
        note: note.trim() || null,
      });
      setMsg({
        kind: "ok",
        text: `Pengiriman ${res.code} disimpan — ${res.noteCount} surat jalan siap dicetak.`,
        deliveryId: res.id,
      });
      setPicked(new Set());
      setNote("");
      refreshPending();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan pengiriman." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader
        kicker="Transaksi / Delivery"
        title="Pengiriman"
        subtitle="Pilih PO yang belum dikirim — satu surat jalan per pelanggan, barang yang sama digabung."
        actions={
          <Link href="/riwayat-pengiriman" className="btn btn-secondary h-11 px-4 text-[15px] no-underline">
            Riwayat pengiriman
          </Link>
        }
      />

      {msg && (
        <div
          role="alert"
          className={clsx(
            "mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-semibold ring-1",
            msg.kind === "ok" ? "bg-teal-200 text-teal-700 ring-teal-400" : "bg-brand-100 text-brand-800 ring-brand-300"
          )}
        >
          <span>{msg.text}</span>
          {msg.deliveryId && (
            <Link href={`/surat-jalan/${msg.deliveryId}`} target="_blank" className="btn btn-primary no-underline">
              Cetak surat jalan
            </Link>
          )}
        </div>
      )}

      {!storeId ? (
        <div className="px-6 pt-4">
          <EmptyState title="Pilih satu toko di bagian atas untuk membuat pengiriman." />
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-6 px-6 pt-4">
          <div className="min-w-0 flex-[1_1_560px]">
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <input
                className="input h-11 max-w-[340px] text-[15px]"
                placeholder="Cari no. PO atau pelanggan…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <span className="text-[13px] text-slate-7">
                {pending?.length ?? 0} PO belum dikirim · {store?.name}
              </span>
            </div>

            {error && <div className="mb-3 bg-brand-100 px-4 py-3 text-sm font-semibold text-brand-800">{error}</div>}
            {loading ? (
              <Loading />
            ) : visible.length === 0 ? (
              <EmptyState title={pending?.length ? "Tidak ada PO yang cocok." : "Semua PO sudah dikirim."} />
            ) : (
              <div className="table-wrap table-scroll">
                <table className="tbl min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="w-[44px]">
                        <input
                          type="checkbox"
                          aria-label="Pilih semua PO"
                          checked={allVisiblePicked}
                          onChange={toggleAll}
                          className="h-4 w-4 accent-brand-600"
                        />
                      </th>
                      <th className="w-[150px]">No. PO</th>
                      <th className="w-[160px]">Tanggal</th>
                      <th>Pelanggan</th>
                      <th className="w-[90px] text-right">Barang</th>
                      <th className="w-[130px] text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((o) => (
                      <tr
                        key={o.id}
                        className={clsx("cursor-pointer", picked.has(o.id) && "bg-brand-100")}
                        onClick={() => toggle(o.id)}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Pilih ${o.code}`}
                            checked={picked.has(o.id)}
                            onChange={() => toggle(o.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 accent-brand-600"
                          />
                        </td>
                        <td className="font-semibold">{o.code}</td>
                        <td className="text-[13px]">{fdatetime(o.date)}</td>
                        <td>
                          <div className="text-sm">{o.customer?.name ?? WALK_IN}</div>
                          <div className="text-[11px] text-slate-7">
                            {o.customer ? (o.customer.address ?? "alamat belum diisi") : "surat jalan sendiri"}
                          </div>
                        </td>
                        <td className="text-right text-[13px]">{o.lines.length} jenis</td>
                        <td className="text-right text-sm font-semibold">{rp(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="min-w-[280px] flex-[0_1_340px] bg-white p-5 ring-2 ring-ink">
            <div className="label-kicker mb-2.5">Data pengiriman</div>
            <div className="field mb-3">
              <label htmlFor="vehicle">Kendaraan</label>
              <SearchSelect
                id="vehicle"
                className="input h-10"
                value={vehicleId}
                onChange={setVehicleId}
                placeholder="Pilih kendaraan…"
                emptyText="Belum ada kendaraan aktif."
                options={activeVehicles.map((v) => ({
                  value: String(v.id),
                  label: [v.vehicleNo, v.vehicleType, v.driver].filter(Boolean).join(" · "),
                }))}
              />
              {vehicles && activeVehicles.length === 0 && (
                <div className="mt-1.5 text-[12px] text-slate-7">Tambahkan kendaraan di menu Master Kendaraan.</div>
              )}
              {vehicle && (
                <div className="mt-1.5 text-[12px] text-slate-7">
                  Sopir: {vehicle.driver ?? "—"} · Kenek: {vehicle.driverAssistance ?? "—"}
                </div>
              )}
            </div>
            <div className="field mb-3">
              <label htmlFor="date">Tanggal kirim</label>
              <input id="date" type="date" className="input h-10" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field mb-3">
              <label htmlFor="note">Catatan (opsional)</label>
              <input
                id="note"
                className="input h-10"
                maxLength={255}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>PO dipilih</span>
              <span className="font-semibold">{selected.length}</span>
            </div>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="label-kicker">Surat jalan</span>
              <span className="text-3xl font-extrabold leading-none">{notes.length}</span>
            </div>
            <button
              className="btn btn-primary h-12 w-full justify-center text-base"
              onClick={submit}
              disabled={busy || selected.length === 0 || !vehicleId || !date}
            >
              {busy ? "Menyimpan…" : "Simpan & buat surat jalan"}
            </button>
            <p className="mt-2.5 text-xs text-slate-7">
              PO yang dipilih ditandai sudah dikirim, lalu ditagih di menu Buat Invoice sesuai barang yang diterima.
              Selama belum ada invoice, membatalkan pengiriman di Riwayat Pengiriman mengembalikannya ke daftar.
            </p>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="px-6 pt-6">
          <h4 className="mb-2.5 text-base">Pratinjau surat jalan</h4>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(440px,100%),1fr))] gap-4">
            {notes.map((n, i) => {
              const multi = n.orders.length > 1;
              return (
                <div key={n.key} className="bg-white p-4 ring-1 ring-divider">
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="label-kicker">Surat jalan {i + 1}</span>
                    <span className={multi ? "tag tag-accent" : "tag tag-neutral"}>{n.orders.length} PO</span>
                  </div>
                  <div className="mt-1 text-lg font-extrabold leading-tight">{n.customer?.name ?? WALK_IN}</div>
                  <div className="text-[13px] text-slate-8">
                    {[n.customer?.address, n.customer?.phone].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div className="mt-1 text-[12px] text-slate-7">{n.orders.map((o) => o.code).join(", ")}</div>
                  <div className="table-wrap mt-3">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Barang</th>
                          <th className="w-[120px] text-right">Total qty</th>
                          {multi && <th className="w-[170px]">Rincian per PO</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {n.items.map((it) => (
                          <tr key={it.itemId}>
                            <td>
                              <div className="text-sm">{it.name}</div>
                              <div className="text-[11px] text-slate-7">{it.code}</div>
                            </td>
                            <td className="text-right text-sm font-semibold">
                              {num(it.qty)} {it.unit}
                            </td>
                            {multi && (
                              <td className="text-[11px] text-slate-7">
                                {it.perOrder.map((p) => `${p.code}: ${num(p.qty)}`).join(" · ")}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
