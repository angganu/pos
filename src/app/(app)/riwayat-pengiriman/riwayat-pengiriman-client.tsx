"use client";

import { useState } from "react";
import Link from "next/link";
import { format, startOfMonth } from "date-fns";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, ErrorBox, EmptyState, Modal } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { can } from "@/lib/rbac";
import { fday } from "@/lib/format";

type DeliveryRow = {
  id: number; code: string; date: string; store: string; createdBy: string;
  vehicleNo: string; vehicleType: string; driver: string | null;
  /** A PO on it has its invoice: the trip can no longer be cancelled. */
  invoiced: boolean;
  notes: { id: number; code: string; customer: string; orders: string[] }[];
};

export default function RiwayatPengirimanClient() {
  const { user, storeId, stores } = useApp();
  const canCancel = can(user, "delivery.manage");

  const [q, setQ] = useState("");
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  // Open-ended by default: next-day deliveries are dated after today.
  const [to, setTo] = useState("");
  const [cancelling, setCancelling] = useState<DeliveryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { data, loading, error, refresh } = useFetch<DeliveryRow[]>(
    `/api/deliveries${qs({ storeId, from, to, q })}`,
    [storeId, from, to, q]
  );

  const noteCount = (data ?? []).reduce((a, d) => a + d.notes.length, 0);
  const orderCount = (data ?? []).reduce((a, d) => a + d.notes.reduce((b, n) => b + n.orders.length, 0), 0);

  async function cancel() {
    if (!cancelling) return;
    setBusy(true);
    setCancelError(null);
    try {
      await api.del(`/api/deliveries${qs({ id: cancelling.id })}`);
      setCancelling(null);
      refresh();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Gagal membatalkan pengiriman.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Laporan / Reports"
        title="Riwayat pengiriman"
        subtitle={`${data?.length ?? 0} pengiriman · ${noteCount} surat jalan · ${orderCount} PO`}
      />

      <div className="flex flex-wrap items-end gap-3 px-6 pt-4">
        <div className="field min-w-[260px]">
          <label htmlFor="q">Cari</label>
          <input
            id="q"
            className="input h-10"
            placeholder="No. pengiriman / surat jalan / PO, pelanggan, no. polisi…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field min-w-[150px]">
          <label htmlFor="from">Dikirim dari</label>
          <input id="from" type="date" className="input h-10" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field min-w-[150px]">
          <label htmlFor="to">Sampai</label>
          <input id="to" type="date" className="input h-10" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="text-[13px] text-slate-7">
          Toko: <strong>{stores.find((s) => s.id === storeId)?.name ?? "Semua toko"}</strong>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="tbl min-w-[900px]">
              <thead>
                <tr>
                  <th className="w-[160px]">Nomor</th>
                  <th className="w-[130px]">Tanggal kirim</th>
                  <th className="w-[210px]">Kendaraan</th>
                  <th>Surat jalan</th>
                  <th className="w-[190px]" />
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="font-semibold">{d.code}</div>
                      <div className="text-[11px] text-slate-7">{d.store} · {d.createdBy}</div>
                    </td>
                    <td className="text-[13px]">{fday(d.date)}</td>
                    <td>
                      <div className="text-sm font-semibold">{d.vehicleNo}</div>
                      <div className="text-[11px] text-slate-7">{[d.vehicleType, d.driver].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="text-[13px]">
                      {d.notes.map((n) => (
                        <div key={n.id}>
                          <Link
                            href={`/surat-jalan/${d.id}?sj=${n.id}`}
                            target="_blank"
                            className="font-semibold"
                            title="Cetak surat jalan ini saja"
                          >
                            {n.code}
                          </Link>{" "}
                          {n.customer} <span className="text-slate-7">({n.orders.join(", ")})</span>
                        </div>
                      ))}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Link href={`/surat-jalan/${d.id}`} target="_blank" className="btn btn-ghost text-xs no-underline">
                        Cetak semua
                      </Link>
                      {canCancel &&
                        (d.invoiced ? (
                          <span className="px-2 text-xs text-slate-6" title="PO di pengiriman ini sudah dibuatkan invoice">
                            Sudah ditagih
                          </span>
                        ) : (
                          <button
                            className="btn btn-ghost text-xs text-brand-700"
                            onClick={() => {
                              setCancelling(d);
                              setCancelError(null);
                            }}
                          >
                            Batalkan
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.length ?? 0) === 0 && <EmptyState title="Belum ada pengiriman pada periode ini." />}
          </div>
        )}
      </div>

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Batalkan pengiriman"
        width="480px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCancelling(null)}>Kembali</button>
            <button className="btn btn-danger" onClick={cancel} disabled={busy}>
              {busy ? "Membatalkan…" : "Batalkan pengiriman"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          {cancelError && (
            <div className="bg-brand-100 px-3 py-2 text-sm font-semibold text-brand-800">{cancelError}</div>
          )}
          <p className="m-0 text-sm">
            Batalkan <b>{cancelling?.code}</b>? {cancelling?.notes.length} surat jalan dihapus dan PO-nya kembali ke
            daftar belum dikirim di menu Pengiriman.
          </p>
        </div>
      </Modal>
    </div>
  );
}
