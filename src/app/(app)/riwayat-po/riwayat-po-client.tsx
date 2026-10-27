"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, Eye, Pencil, Printer } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, ErrorBox, EmptyState, Modal, Chip, IconAction } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { can } from "@/lib/rbac";
import { rp, num, fdatetime, fday } from "@/lib/format";

type Status = "UNPAID" | "PAID" | "VOID";

type Delivery = { id: number; code: string; date: string; noteId: number; noteCode: string; vehicleNo: string };

type OrderRow = {
  id: number; code: string; date: string; storeCode: string; customer: string; createdBy: string;
  lineCount: number; total: number; status: Status; isDelivered: boolean;
  delivery: Delivery | null; invoiceCode: string | null;
};

type OrderDetail = {
  id: number; code: string; date: string; status: Status;
  subtotal: number; discount: number; tax: number; total: number;
  store: { name: string; address: string | null; phone: string | null };
  customer: { code: string; name: string } | null; createdBy: string;
  delivery: Delivery | null; invoice: { id: number; code: string } | null;
  items: { id: number; code: string; name: string; unit: string; qty: number; unitPrice: number; discount: number; total: number }[];
};

const STATUS: Record<Status, { label: string; tag: string }> = {
  UNPAID: { label: "Belum dibayar", tag: "tag tag-amber" },
  PAID: { label: "Lunas", tag: "tag tag-teal" },
  VOID: { label: "Dibatalkan", tag: "tag tag-neutral" },
};

export default function RiwayatPoClient() {
  const { user, storeId, stores } = useApp();
  const canCancel = can(user, "sale.void");
  const canEdit = can(user, "sale.create");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  // Open-ended by default, so POs taken today are listed too.
  const [to, setTo] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<OrderRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { data, loading, error, refresh } = useFetch<OrderRow[]>(
    `/api/orders${qs({ storeId, from, to, q, status })}`,
    [storeId, from, to, q, status]
  );
  const { data: detail } = useFetch<OrderDetail>(detailId ? `/api/orders${qs({ id: detailId })}` : null, [detailId]);
  const shown = detail && detail.id === detailId ? detail : null;

  const unpaid = (data ?? []).filter((o) => o.status === "UNPAID");
  const unpaidValue = unpaid.reduce((a, o) => a + o.total, 0);

  async function cancel() {
    if (!cancelling) return;
    setBusy(true);
    setCancelError(null);
    try {
      await api.del(`/api/orders${qs({ id: cancelling.id })}`);
      setCancelling(null);
      refresh();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Gagal membatalkan PO.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Laporan / Reports"
        title="Riwayat PO"
        subtitle={`${data?.length ?? 0} purchase order · ${unpaid.length} belum dibayar senilai ${rp(unpaidValue)}`}
      />

      <div className="flex flex-wrap items-end gap-3 px-6 pt-4">
        <div className="field min-w-[240px]">
          <label htmlFor="q">Cari</label>
          <input
            id="q"
            className="input h-10"
            placeholder="No. PO / invoice, nama pelanggan…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field min-w-[150px]">
          <label htmlFor="from">Dari tanggal</label>
          <input id="from" type="date" className="input h-10" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field min-w-[150px]">
          <label htmlFor="to">Sampai tanggal</label>
          <input id="to" type="date" className="input h-10" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
          <Chip active={status === ""} onClick={() => setStatus("")}>Semua</Chip>
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {STATUS[s].label}
            </Chip>
          ))}
        </div>
        <div className="pb-2 text-[13px] text-slate-7">
          Toko: <strong>{stores.find((s) => s.id === storeId)?.name ?? "Semua toko"}</strong>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="tbl min-w-[1040px]">
              <thead>
                <tr>
                  <th className="w-[140px]">Nomor</th>
                  <th className="w-[150px]">Tanggal</th>
                  <th>Pelanggan</th>
                  <th className="w-[60px] text-right">Item</th>
                  <th className="w-[120px] text-right">Total</th>
                  <th className="w-[120px]">Status</th>
                  <th className="w-[160px]">Pengiriman</th>
                  <th className="w-[130px]">Invoice</th>
                  <th className="w-[130px]" />
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="font-semibold">{o.code}</div>
                      <div className="text-[11px] text-slate-7">{o.storeCode} · {o.createdBy}</div>
                    </td>
                    <td className="text-[13px]">{fdatetime(o.date)}</td>
                    <td className="text-[13px]">{o.customer}</td>
                    <td className="text-right text-[13px]">{o.lineCount}</td>
                    <td className="text-right text-sm font-semibold">{rp(o.total)}</td>
                    <td>
                      <span className={STATUS[o.status].tag}>{STATUS[o.status].label}</span>
                    </td>
                    <td className="text-[13px]">
                      {o.delivery ? (
                        <>
                          <Link
                            href={`/surat-jalan/${o.delivery.id}?sj=${o.delivery.noteId}`}
                            target="_blank"
                            className="font-semibold"
                            title="Cetak surat jalan"
                          >
                            {o.delivery.noteCode}
                          </Link>
                          <div className="text-[11px] text-slate-7">{fday(o.delivery.date)} · {o.delivery.vehicleNo}</div>
                        </>
                      ) : o.isDelivered ? (
                        <span className="text-slate-7">Sudah dikirim</span>
                      ) : (
                        <span className="text-slate-6">Belum dikirim</span>
                      )}
                    </td>
                    <td className="text-[13px]">{o.invoiceCode ?? "—"}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <IconAction label="Lihat detail" icon={Eye} tone="success" onClick={() => setDetailId(o.id)} />
                        {/* Only before delivery: once on a surat jalan its goods are fixed. */}
                        {canEdit && o.status === "UNPAID" && !o.isDelivered && (
                          <IconAction label="Edit PO" icon={Pencil} tone="warning" href={`/kasir?edit=${o.id}`} />
                        )}
                        {canCancel && o.status === "UNPAID" && (
                          <IconAction
                            label="Batalkan PO"
                            icon={Ban}
                            tone="danger"
                            onClick={() => {
                              setCancelling(o);
                              setCancelError(null);
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.length ?? 0) === 0 && <EmptyState title="Tidak ada PO yang cocok dengan filter." />}
          </div>
        )}
      </div>

      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Detail purchase order"
        width="680px"
        footer={
          <>
            <button className="btn btn-secondary no-print" onClick={() => setDetailId(null)}>Tutup</button>
            <button className="btn btn-primary no-print" onClick={() => window.print()}>
              <Printer size={14} /> Cetak
            </button>
          </>
        }
      >
        {shown ? (
          <div>
            <div className="mb-4 text-center">
              <div className="text-lg font-extrabold">{shown.store.name}</div>
              <div className="text-[13px] text-slate-7">{shown.store.address}</div>
              <div className="text-[13px] text-slate-7">{shown.store.phone}</div>
              <div className="mt-2 text-base font-extrabold">PURCHASE ORDER</div>
            </div>
            <div className="mb-3 flex flex-wrap justify-between gap-2 text-[13px]">
              <div>
                <div>No. PO: <strong>{shown.code}</strong></div>
                <div>Tanggal: {fdatetime(shown.date)}</div>
                <div>
                  Status: <span className={STATUS[shown.status].tag}>{STATUS[shown.status].label}</span>
                </div>
              </div>
              <div>
                <div>Kasir: {shown.createdBy}</div>
                <div>Pelanggan: {shown.customer?.name ?? "Pelanggan Umum"}</div>
                <div>
                  Surat jalan:{" "}
                  {shown.delivery ? `${shown.delivery.noteCode} · ${fday(shown.delivery.date)}` : "belum dikirim"}
                </div>
                <div>Invoice: {shown.invoice?.code ?? "—"}</div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="tbl min-w-full">
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th className="w-[90px] text-right">Qty</th>
                    <th className="w-[120px] text-right">Harga</th>
                    <th className="w-[100px] text-right">Diskon</th>
                    <th className="w-[130px] text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.items.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="text-sm font-semibold">{l.name}</div>
                        <div className="text-[11px] text-slate-7">{l.code}</div>
                      </td>
                      <td className="whitespace-nowrap text-right text-[13px]">{num(l.qty)} {l.unit}</td>
                      <td className="text-right text-[13px]">{rp(l.unitPrice)}</td>
                      <td className="text-right text-[13px]">{rp(l.discount)}</td>
                      <td className="text-right text-sm font-semibold">{rp(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <div className="w-[260px] text-sm">
                <div className="flex justify-between py-0.5"><span>Subtotal</span><span>{rp(shown.subtotal)}</span></div>
                <div className="flex justify-between py-0.5"><span>Diskon</span><span>-{rp(shown.discount)}</span></div>
                <div className="flex justify-between py-0.5"><span>PPN</span><span>{rp(shown.tax)}</span></div>
                <div className="flex justify-between border-t border-divider py-1 font-bold"><span>TOTAL</span><span>{rp(shown.total)}</span></div>
              </div>
            </div>
            {shown.invoice && (
              <p className="mb-0 mt-3 text-[13px] text-slate-7">
                Yang ditagih mengikuti barang yang diterima pelanggan — lihat invoice {shown.invoice.code} di Riwayat
                Penjualan.
              </p>
            )}
          </div>
        ) : (
          <Loading />
        )}
      </Modal>

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Batalkan PO"
        width="480px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCancelling(null)}>Kembali</button>
            <button className="btn btn-danger" onClick={cancel} disabled={busy}>
              {busy ? "Membatalkan…" : "Batalkan PO"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          {cancelError && (
            <div className="bg-brand-100 px-3 py-2 text-sm font-semibold text-brand-800">{cancelError}</div>
          )}
          <p className="m-0 text-sm">
            Batalkan <b>{cancelling?.code}</b> ({cancelling?.customer}, {rp(cancelling?.total)})? PO yang dibatalkan
            tidak bisa dikirim atau ditagih lagi. Stok tidak berubah — stok baru berkurang saat invoice dibuat.
          </p>
          {cancelling?.isDelivered && (
            <p className="m-0 text-[13px] text-slate-7">
              PO ini sudah dikirim; surat jalannya tetap tercatat di Riwayat Pengiriman.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
