"use client";

import { useState } from "react";
import { Eye, Printer } from "lucide-react";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, ErrorBox, EmptyState, Modal, SearchSelect } from "@/components/ui";
import { qs } from "@/lib/client";
import { rp, num, fdatetime } from "@/lib/format";

type PurchaseRow = {
  id: number; code: string; date: string;
  supplier: string; store: string; user: string;
  subtotal: number; discount: number; tax: number; total: number;
  status: string; lineCount: number;
};

type PurchaseDetail = {
  id: number; code: string; date: string; note: string | null;
  store: { name: string; address: string | null; phone: string | null };
  supplier: { name: string; code: string; phone: string | null };
  user: { name: string };
  subtotal: number; discount: number; tax: number; total: number; status: string;
  lines: {
    id: number; itemName: string; itemCode: string; unitLabel: string; baseUnit: string;
    qty: number; baseQty: number; pricePerUnit: number; pricePerBase: number; discount: number; total: number;
  }[];
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", POSTED: "Selesai", VOID: "Dibatalkan" };

export default function RiwayatPembelianClient() {
  const { storeId, stores } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);

  const [q, setQ] = useState("");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [from, setFrom] = useState(monthStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: suppliers } = useFetch<{ id: number; code: string; name: string }[]>("/api/suppliers");
  const { data: items } = useFetch<{ id: number; code: string; name: string }[]>("/api/items");

  const { data: purchases, loading, error } = useFetch<PurchaseRow[]>(
    `/api/purchases${qs({ storeId, from, to, q, supplierId, itemId })}`,
    [storeId, from, to, q, supplierId, itemId]
  );

  const { data: detail } = useFetch<PurchaseDetail>(
    detailId ? `/api/purchases${qs({ id: detailId })}` : null,
    [detailId]
  );

  const totalNilai = (purchases ?? []).reduce((a, p) => a + p.total, 0);

  return (
    <div>
      <PageHeader
        kicker="Laporan / Reports"
        title="Riwayat pembelian"
        subtitle={`${purchases?.length ?? 0} transaksi · total nilai ${rp(totalNilai)}`}
      />

      <div className="flex flex-wrap items-end gap-3 px-6 pt-4">
        <div className="field min-w-[220px]">
          <label htmlFor="q">Cari</label>
          <input
            id="q"
            className="input h-10"
            placeholder="Nomor faktur / nama supplier…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field min-w-[200px]">
          <label htmlFor="sup">Supplier</label>
          <SearchSelect
            id="sup"
            className="input h-10"
            value={supplierId !== null ? String(supplierId) : ""}
            onChange={(v) => setSupplierId(v ? Number(v) : null)}
            placeholder="Semua supplier"
            options={[{ value: "", label: "Semua supplier" }, ...(suppliers ?? []).map((s) => ({ value: String(s.id), label: `${s.code} · ${s.name}` }))]}
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
                  <th className="w-[150px]">Nomor</th>
                  <th className="w-[160px]">Tanggal</th>
                  <th>Supplier</th>
                  <th className="w-[130px]">Toko</th>
                  <th className="w-[130px]">Dientri oleh</th>
                  <th className="w-[70px] text-right">Item</th>
                  <th className="w-[130px] text-right">Total</th>
                  <th className="w-[110px]">Status</th>
                  <th className="w-[70px]" />
                </tr>
              </thead>
              <tbody>
                {(purchases ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="font-semibold">{p.code}</td>
                    <td className="text-[13px]">{fdatetime(p.date)}</td>
                    <td className="text-[13px]">{p.supplier}</td>
                    <td className="text-[13px]">{p.store}</td>
                    <td className="text-[13px]">{p.user}</td>
                    <td className="text-right text-[13px]">{p.lineCount}</td>
                    <td className="text-right text-sm font-semibold">{rp(p.total)}</td>
                    <td>
                      <span className={p.status === "VOID" ? "tag tag-neutral" : "tag tag-accent"}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost px-1.5 py-1" onClick={() => setDetailId(p.id)} aria-label="Lihat detail">
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(purchases?.length ?? 0) === 0 && <EmptyState title="Tidak ada transaksi pembelian yang cocok dengan filter." />}
          </div>
        )}
      </div>

      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Detail pembelian"
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
              <div className="mt-2 text-base font-extrabold">LAPORAN PEMBELIAN</div>
            </div>
            <div className="mb-3 flex flex-wrap justify-between gap-2 text-[13px]">
              <div>
                <div>No. Faktur: <strong>{detail.code}</strong></div>
                <div>Tanggal: {fdatetime(detail.date)}</div>
              </div>
              <div>
                <div>Dientri oleh: {detail.user.name}</div>
                <div>Supplier: {detail.supplier.name} ({detail.supplier.code})</div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="tbl min-w-full">
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th className="w-[130px] text-right">Qty</th>
                    <th className="w-[120px] text-right">Harga / satuan</th>
                    <th className="w-[100px] text-right">Diskon</th>
                    <th className="w-[130px] text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="text-sm font-semibold">{l.itemName}</div>
                        <div className="text-[11px] text-slate-7">{l.itemCode} · = {num(l.baseQty)} {l.baseUnit}</div>
                      </td>
                      <td className="text-right text-[13px]">{num(l.qty)} {l.unitLabel}</td>
                      <td className="text-right text-[13px]">{rp(l.pricePerUnit)}</td>
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
              </div>
            </div>
            {detail.note && <div className="mt-3 text-[13px] text-slate-7">Catatan: {detail.note}</div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
