"use client";

import { useState } from "react";
import { Eye, Printer } from "lucide-react";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, ErrorBox, EmptyState, Modal, SearchSelect } from "@/components/ui";
import { qs } from "@/lib/client";
import { rp, num, fdatetime } from "@/lib/format";

type SaleRow = {
  id: number; code: string; date: string;
  store: string; storeCode: string;
  customer: string; customerTier: string | null;
  cashier: string; lineCount: number;
  subtotal: number; discount: number; tax: number; total: number;
  paymentMethod: string; status: string;
};

type SaleDetail = {
  id: number; code: string; date: string;
  store: { name: string; address: string | null; phone: string | null };
  customer: { name: string; code: string } | null;
  user: { name: string };
  subtotal: number; discount: number; tax: number; total: number;
  paid: number; change: number; paymentMethod: string; status: string;
  lines: {
    id: number; itemName: string; itemCode: string; unit: string;
    qty: number; unitPrice: number; discount: number; total: number;
  }[];
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", POSTED: "Selesai", VOID: "Dibatalkan" };

export default function RiwayatPenjualanClient() {
  const { storeId, stores } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);

  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [from, setFrom] = useState(monthStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: customers } = useFetch<{ id: number; code: string; name: string }[]>("/api/customers");
  const { data: items } = useFetch<{ id: number; code: string; name: string }[]>("/api/items");

  const { data: sales, loading, error } = useFetch<SaleRow[]>(
    `/api/sales${qs({ storeId, from, to, q, customerId, itemId })}`,
    [storeId, from, to, q, customerId, itemId]
  );

  const { data: detail } = useFetch<SaleDetail>(
    detailId ? `/api/sales${qs({ id: detailId })}` : null,
    [detailId]
  );

  const totalOmzet = (sales ?? []).reduce((a, s) => a + s.total, 0);

  return (
    <div>
      <PageHeader
        kicker="Laporan / Reports"
        title="Riwayat penjualan"
        subtitle={`${sales?.length ?? 0} transaksi · total omzet ${rp(totalOmzet)}`}
      />

      <div className="flex flex-wrap items-end gap-3 px-6 pt-4">
        <div className="field min-w-[220px]">
          <label htmlFor="q">Cari</label>
          <input
            id="q"
            className="input h-10"
            placeholder="Nomor struk / nama pelanggan…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field min-w-[200px]">
          <label htmlFor="cust">Pelanggan</label>
          <SearchSelect
            id="cust"
            className="input h-10"
            value={customerId !== null ? String(customerId) : ""}
            onChange={(v) => setCustomerId(v ? Number(v) : null)}
            placeholder="Semua pelanggan"
            options={[{ value: "", label: "Semua pelanggan" }, ...(customers ?? []).map((c) => ({ value: String(c.id), label: `${c.code} · ${c.name}` }))]}
          />
        </div>
        <div className="field min-w-[200px]">
          <label htmlFor="item">Barang</label>
          <SearchSelect
            id="item"
            className="input h-10"
            value={itemId !== null ? String(itemId) : ""}
            onChange={(v) => setItemId(v ? Number(v) : null)}
            placeholder="Semua barang"
            options={[{ value: "", label: "Semua barang" }, ...(items ?? []).map((i) => ({ value: String(i.id), label: `${i.code} · ${i.name}` }))]}
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
            <table className="tbl min-w-[980px]">
              <thead>
                <tr>
                  <th className="w-[140px]">Nomor</th>
                  <th className="w-[160px]">Tanggal</th>
                  <th>Pelanggan</th>
                  <th className="w-[130px]">Kasir</th>
                  <th className="w-[100px]">Toko</th>
                  <th className="w-[70px] text-right">Item</th>
                  <th className="w-[130px] text-right">Total</th>
                  <th className="w-[110px]">Status</th>
                  <th className="w-[70px]" />
                </tr>
              </thead>
              <tbody>
                {(sales ?? []).map((s) => (
                  <tr key={s.id}>
                    <td className="font-semibold">{s.code}</td>
                    <td className="text-[13px]">{fdatetime(s.date)}</td>
                    <td className="text-[13px]">{s.customer}</td>
                    <td className="text-[13px]">{s.cashier}</td>
                    <td className="text-[13px]">{s.storeCode}</td>
                    <td className="text-right text-[13px]">{s.lineCount}</td>
                    <td className="text-right text-sm font-semibold">{rp(s.total)}</td>
                    <td>
                      <span className={s.status === "VOID" ? "tag tag-neutral" : "tag tag-accent"}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost px-1.5 py-1" onClick={() => setDetailId(s.id)} aria-label="Lihat detail">
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(sales?.length ?? 0) === 0 && <EmptyState title="Tidak ada transaksi penjualan yang cocok dengan filter." />}
          </div>
        )}
      </div>

      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Detail penjualan"
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
        {detail && (
          <div>
            <div className="mb-4 text-center">
              <div className="text-lg font-extrabold">{detail.store.name}</div>
              <div className="text-[13px] text-slate-7">{detail.store.address}</div>
              <div className="text-[13px] text-slate-7">{detail.store.phone}</div>
              <div className="mt-2 text-base font-extrabold">LAPORAN PENJUALAN</div>
            </div>
            <div className="mb-3 flex flex-wrap justify-between gap-2 text-[13px]">
              <div>
                <div>No. Struk: <strong>{detail.code}</strong></div>
                <div>Tanggal: {fdatetime(detail.date)}</div>
              </div>
              <div>
                <div>Kasir: {detail.user.name}</div>
                <div>Pelanggan: {detail.customer?.name ?? "Pelanggan Umum"}</div>
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
                  {detail.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="text-sm font-semibold">{l.itemName}</div>
                        <div className="text-[11px] text-slate-7">{l.itemCode}</div>
                      </td>
                      <td className="text-right text-[13px]">{num(l.qty)} {l.unit}</td>
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
                <div className="flex justify-between py-0.5"><span>Subtotal</span><span>{rp(detail.subtotal)}</span></div>
                <div className="flex justify-between py-0.5"><span>Diskon</span><span>-{rp(detail.discount)}</span></div>
                <div className="flex justify-between py-0.5"><span>Pajak</span><span>{rp(detail.tax)}</span></div>
                <div className="flex justify-between border-t border-divider py-1 font-bold"><span>TOTAL</span><span>{rp(detail.total)}</span></div>
                <div className="flex justify-between py-0.5"><span>{detail.paymentMethod}</span><span>{rp(detail.paid)}</span></div>
                <div className="flex justify-between py-0.5"><span>Kembali</span><span>{rp(detail.change)}</span></div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
