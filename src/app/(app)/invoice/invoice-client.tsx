"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import clsx from "clsx";
import { Printer } from "lucide-react";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState, Modal, SearchSelect, PAPER_TABLE } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { can } from "@/lib/rbac";
import { rp, num, fdatetime, fday } from "@/lib/format";

type Delivery = { code: string; date: string; noteCode: string; vehicleNo: string };

type OrderRow = {
  id: number; code: string; date: string; storeCode: string; customer: string;
  lineCount: number; total: number; isDelivered: boolean; delivery: Delivery | null;
};

type OrderItem = {
  id: number; itemId: number; code: string; name: string; unit: string;
  qty: number; unitPrice: number; discount: number; total: number; isMember: boolean;
};

type OrderDetail = {
  id: number; code: string; date: string; status: string; isDelivered: boolean; tax: number;
  store: { name: string }; customer: { code: string; name: string } | null; createdBy: string;
  delivery: Delivery | null; items: OrderItem[];
};

type Invoice = Awaited<ReturnType<typeof postInvoice>>;

async function postInvoice(body: unknown) {
  return api.post<{
    id: number; code: string; date: string; orderCode: string | null;
    store: { name: string; address: string | null; phone: string | null };
    customer: { name: string; code: string; points: number } | null;
    cashier: string; subtotal: number; discount: number; tax: number; total: number;
    paid: number; change: number; paymentMethod: string; pointsEarned: number;
    lines: { name: string; code: string; unit: string; qty: number; unitPrice: number; discount: number; total: number }[];
  }>("/api/sales", body);
}

/** What the customer received of one PO line, and at what price — what the invoice bills. */
type Received = { qty: number; unitPrice: number; discount: number };

const TAX_RATE = 11;
const PAYMENT = { CASH: "Tunai", QRIS: "QRIS", CARD: "Kartu Debit", SPLIT: "Gabungan" } as const;
type Payment = keyof typeof PAYMENT;

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const asOrdered = (it: OrderItem): Received => ({ qty: it.qty, unitPrice: it.unitPrice, discount: it.discount });

export default function InvoiceClient() {
  // null = all stores (owners/admins); store-pinned roles are scoped by the server anyway.
  const { user, storeId } = useApp();
  const canReprice = can(user, "price.manage");

  const { data: open, loading, error, refresh } = useFetch<OrderRow[]>(
    `/api/orders${qs({ status: "UNPAID", storeId })}`,
    [storeId]
  );
  const [orderId, setOrderId] = useState<number | null>(null);
  const { data: order, loading: loadingOrder, error: orderError } = useFetch<OrderDetail>(
    orderId ? `/api/orders${qs({ id: orderId })}` : null,
    [orderId]
  );

  /** Edited lines by PO line id; a line not edited is billed exactly as ordered. */
  const [received, setReceived] = useState<Record<number, Received>>({});
  /** null = as on the PO, which was taxed or not at the kasir. */
  const [taxChoice, setTaxChoice] = useState<boolean | null>(null);
  const [payment, setPayment] = useState<Payment>("CASH");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);

  // Invoices bill what the customer received, so only delivered POs can be picked.
  const ready = (open ?? []).filter((o) => o.isDelivered).sort((a, b) => a.date.localeCompare(b.date));
  const waiting = (open?.length ?? 0) - ready.length;

  // The previous PO's detail stays in `order` until the new one arrives: never bill it.
  const current = order && order.id === orderId ? order : null;
  const billable = current?.status === "UNPAID" && current.isDelivered;

  const rows = (current?.items ?? []).map((it) => {
    const r = received[it.id] ?? asOrdered(it);
    const gross = r.qty * r.unitPrice;
    return { it, r, gross, total: gross - r.discount, short: round4(it.qty - r.qty) };
  });
  const billed = rows.filter((x) => x.r.qty > 0);
  const taxOn = taxChoice ?? (current ? current.tax > 0 : true);
  const subtotal = billed.reduce((a, x) => a + x.gross, 0);
  const discount = billed.reduce((a, x) => a + x.r.discount, 0);
  const tax = taxOn ? Math.round((subtotal - discount) * (TAX_RATE / 100)) : 0;
  const total = subtotal - discount + tax;
  const overDiscount = billed.some((x) => x.r.discount > x.gross);
  const shortCount = rows.filter((x) => x.short > 0).length;

  function pick(id: number | null) {
    setOrderId(id);
    setReceived({});
    setTaxChoice(null);
    setPayment("CASH");
  }

  function edit(it: OrderItem, patch: Partial<Received>) {
    setReceived((s) => ({ ...s, [it.id]: { ...(s[it.id] ?? asOrdered(it)), ...patch } }));
  }

  async function submit() {
    if (!current) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await postInvoice({
        orderId: current.id,
        taxEnabled: taxOn,
        taxRate: TAX_RATE,
        paymentMethod: payment,
        lines: rows.map((x) => ({
          orderItemId: x.it.id, qty: x.r.qty, unitPrice: x.r.unitPrice,
          discount: x.r.qty > 0 ? x.r.discount : 0,
        })),
      });
      setInvoice(res);
      setShowInvoice(true);
      pick(null);
      setMsg({ kind: "ok", text: `Invoice ${res.code} untuk ${res.orderCode} tersimpan. Stok sudah dikurangi.` });
      refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan invoice." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Transaksi / Invoice"
        title="Buat invoice"
        subtitle="Pilih PO yang sudah dikirim, lalu sesuaikan qty dan harga dengan barang yang diterima pelanggan."
      />

      <div className="flex flex-wrap items-end gap-3 px-6 pt-4">
        <div className="field min-w-[280px] flex-[0_1_560px]">
          <label htmlFor="po">Purchase order belum dibayar</label>
          <SearchSelect
            id="po"
            className="input h-11 text-[15px] font-semibold"
            value={orderId !== null ? String(orderId) : ""}
            onChange={(v) => {
              pick(v ? Number(v) : null);
              setMsg(null);
            }}
            placeholder={loading ? "Memuat PO…" : "Pilih PO yang sudah dikirim…"}
            emptyText="Tidak ada PO yang siap ditagih."
            options={ready.map((o) => ({
              value: String(o.id),
              label: [
                storeId ? null : o.storeCode, o.code, o.customer,
                `dikirim ${fday(o.delivery?.date)}`, rp(o.total),
              ].filter(Boolean).join(" · "),
            }))}
          />
        </div>
        <div className="pb-2.5 text-[13px] text-slate-7">
          {ready.length} PO siap ditagih
          {waiting > 0 && (
            <>
              {" "}· {waiting} PO belum dikirim —{" "}
              <Link href="/pengiriman" className="font-semibold">buat pengiriman</Link>
            </>
          )}
        </div>
      </div>

      {msg && (
        <div
          role="alert"
          className={clsx(
            "mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-semibold ring-1",
            msg.kind === "ok" ? "bg-teal-200 text-teal-700 ring-teal-400" : "bg-brand-100 text-brand-800 ring-brand-300"
          )}
        >
          <span>{msg.text}</span>
          {msg.kind === "ok" && invoice && (
            <button className="btn btn-primary" onClick={() => setShowInvoice(true)}>
              <Printer size={14} /> Lihat & cetak invoice
            </button>
          )}
        </div>
      )}
      {(error || orderError) && (
        <div className="mx-6 mt-4 bg-brand-100 px-4 py-3 text-sm font-semibold text-brand-800">{error ?? orderError}</div>
      )}

      {!orderId && !msg && !loading && ready.length === 0 && (
        <div className="px-6 pt-4">
          <EmptyState
            title="Belum ada PO yang siap ditagih."
            hint="PO dibuat di Kasir, lalu dikirim lewat menu Pengiriman. Setelah itu invoicenya dibuat di sini."
          />
        </div>
      )}

      {orderId !== null && loadingOrder && !current && <Loading label="Memuat PO…" />}

      {current && (
        <div className="flex flex-wrap items-start gap-6 px-6 pb-10 pt-5">
          <div className="min-w-0 flex-[1_1_560px]">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
              <div className="text-[13px] text-slate-7">
                PO <strong className="text-ink">{current.code}</strong> · {fdatetime(current.date)} ·{" "}
                {current.customer?.name ?? "Pelanggan Umum"} · {current.store.name} · kasir {current.createdBy}
                {current.delivery && (
                  <>
                    <br />
                    Dikirim {fday(current.delivery.date)} · {current.delivery.code} · surat jalan{" "}
                    {current.delivery.noteCode} · {current.delivery.vehicleNo}
                  </>
                )}
              </div>
              {Object.keys(received).length > 0 && (
                <button className="btn btn-ghost px-1.5 py-0.5 text-xs" onClick={() => setReceived({})}>
                  Kembalikan sesuai PO
                </button>
              )}
            </div>

            {!billable && (
              <div className="mb-3 bg-brand-100 px-4 py-3 text-sm font-semibold text-brand-800">
                {current.status === "PAID"
                  ? "PO ini sudah dibuatkan invoice."
                  : current.status === "VOID"
                    ? "PO ini sudah dibatalkan."
                    : "PO ini belum dikirim — buat pengiriman dulu."}
              </div>
            )}

            <div className="table-wrap">
              <table className="tbl min-w-[760px]">
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th className="w-[110px] text-right">Dipesan</th>
                    <th className="w-[150px]">Qty diterima</th>
                    <th className="w-[130px] text-right">Harga satuan</th>
                    <th className="w-[110px] text-right">Diskon</th>
                    <th className="w-[120px] text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ it, r, gross, total: lineTotal, short }) => (
                    <tr key={it.id} className={clsx(r.qty === 0 && "opacity-60")}>
                      <td>
                        <div className="text-sm font-semibold">{it.name}</div>
                        <div className="text-[11px] text-slate-7">
                          {it.code}
                          {it.isMember && " · harga member"}
                        </div>
                      </td>
                      <td className="text-right text-sm">
                        {num(it.qty)} {it.unit}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={it.qty}
                            step="any"
                            aria-label={`Qty diterima ${it.name}`}
                            className="input h-9 w-[84px] text-right"
                            value={r.qty}
                            disabled={!billable}
                            onChange={(e) => edit(it, { qty: Math.max(0, Math.min(Number(e.target.value) || 0, it.qty)) })}
                          />
                          <span className="text-[12px] text-slate-7">{it.unit}</span>
                        </div>
                        {short > 0 && (
                          <div className="mt-1 text-[11px] text-amber-700">
                            {r.qty === 0 ? "tidak diterima" : `kurang ${num(short)} ${it.unit}`}
                          </div>
                        )}
                      </td>
                      <td>
                        <input
                          inputMode="numeric"
                          aria-label={`Harga satuan ${it.name}`}
                          title={canReprice ? undefined : "Mengubah harga butuh hak ubah harga jual."}
                          className="input h-9 text-right font-semibold"
                          value={r.unitPrice ? num(r.unitPrice) : ""}
                          placeholder="0"
                          disabled={!billable || !canReprice}
                          onChange={(e) => edit(it, { unitPrice: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                        />
                        {r.unitPrice !== it.unitPrice && (
                          <div className="mt-1 text-right text-[11px] text-slate-7">harga PO {rp(it.unitPrice)}</div>
                        )}
                      </td>
                      <td>
                        <input
                          inputMode="numeric"
                          aria-label={`Diskon ${it.name}`}
                          className="input h-9 text-right"
                          value={r.discount ? num(r.discount) : ""}
                          placeholder="0"
                          disabled={!billable}
                          onChange={(e) => edit(it, { discount: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                        />
                        {r.qty > 0 && r.discount > gross && (
                          <div className="mt-1 text-right text-[11px] text-brand-700">melebihi harga barang</div>
                        )}
                      </td>
                      <td className="text-right text-[15px] font-semibold">{r.qty > 0 ? rp(lineTotal) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!canReprice && (
              <p className="mt-2 text-xs text-slate-7">
                Harga mengikuti PO. Mengubah harga butuh hak ubah harga jual (manajer ke atas).
              </p>
            )}
          </div>

          <div className="min-w-[280px] flex-[0_1_340px] bg-white p-5 ring-2 ring-ink">
            <div className="label-kicker mb-2.5">Ringkasan invoice</div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>Barang ditagih</span>
              <span className="font-semibold">
                {billed.length} dari {rows.length}
              </span>
            </div>
            {shortCount > 0 && (
              <div className="mb-1.5 text-[12px] text-amber-700">
                {shortCount} barang diterima kurang dari pesanan — sisanya tetap di stok.
              </div>
            )}
            <div className="my-2 h-0.5 bg-divider" />
            <div className="mb-1 flex justify-between text-[13px]">
              <span>Subtotal</span>
              <span className="font-semibold">{rp(subtotal)}</span>
            </div>
            <div className="mb-1 flex justify-between text-[13px]">
              <span>Diskon</span>
              <span className="font-semibold text-brand-700">– {rp(discount)}</span>
            </div>
            <label className="mb-1 flex cursor-pointer items-center justify-between text-[13px]">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={taxOn}
                  disabled={!billable}
                  onChange={(e) => setTaxChoice(e.target.checked)}
                  className="h-4 w-4 accent-brand-600"
                />
                PPN {TAX_RATE}%
              </span>
              <span className="font-semibold">{rp(tax)}</span>
            </label>
            <div className="my-2 h-0.5 bg-divider" />
            <div className="mb-3 flex items-baseline justify-between">
              <span className="label-kicker">Total</span>
              <span className="text-3xl font-extrabold leading-none">{rp(total)}</span>
            </div>

            <div className="label-kicker mb-1.5">Pembayaran</div>
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              {(Object.keys(PAYMENT) as Payment[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayment(m)}
                  disabled={!billable}
                  className={clsx(
                    "px-2 py-2 text-[13px] font-semibold ring-1 ring-divider transition-colors",
                    payment === m ? "bg-ink text-white" : "bg-white hover:bg-slate-2"
                  )}
                >
                  {PAYMENT[m]}
                </button>
              ))}
            </div>

            <button
              className="btn btn-primary h-12 w-full justify-center text-base"
              onClick={submit}
              disabled={busy || !billable || billed.length === 0 || overDiscount}
            >
              {busy ? "Menyimpan…" : "Simpan invoice"}
            </button>
            <p className="mt-2.5 text-xs text-slate-7">
              {billed.length === 0
                ? "Isi qty diterima minimal untuk satu barang. Bila tidak ada yang diterima, batalkan PO-nya di Riwayat PO."
                : "Stok berkurang sebesar qty diterima dan PO ditandai lunas. Invoice tercatat di Riwayat Penjualan."}
            </p>
          </div>
        </div>
      )}

      <Modal
        open={showInvoice && invoice !== null}
        onClose={() => setShowInvoice(false)}
        title="Invoice"
        width="760px"
        footer={
          <>
            <button className="btn btn-secondary no-print" onClick={() => setShowInvoice(false)}>Tutup</button>
            <button className="btn btn-primary no-print" onClick={() => window.print()}>
              <Printer size={14} /> Cetak
            </button>
          </>
        }
      >
        {invoice && (
          <div className="bg-white p-4 ring-1 ring-divider">
            <InvoiceSheet invoice={invoice} />
          </div>
        )}
      </Modal>
      {/* What reaches the paper. The modal is pinned to the screen and scrolls, so printing it
          showed one screenful; this copy sits in the page flow and runs on for as many pages
          as the invoice needs, without the screen behind the modal. */}
      {invoice && showInvoice &&
        createPortal(
          <div className="print-only hidden print:block">
            <InvoiceSheet invoice={invoice} />
          </div>,
          document.body
        )}
    </div>
  );
}

/** The invoice as it goes on paper; the modal previews the same sheet. */
function InvoiceSheet({ invoice: inv }: { invoice: Invoice }) {
  const sums: [string, string][] = [
    ["Subtotal", rp(inv.subtotal)],
    ["Diskon", `– ${rp(inv.discount)}`],
    ["PPN", rp(inv.tax)],
  ];
  return (
    <div className="text-[13px] leading-snug text-ink">
      <div className="flex items-start justify-between gap-4 border-b-2 border-ink pb-2">
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold tracking-[0.06em]">KASAKU</div>
          <div className="font-semibold">{inv.store.name}</div>
          {inv.store.address && <div>{inv.store.address}</div>}
          {inv.store.phone && <div>Telp. {inv.store.phone}</div>}
        </div>
        <div className="flex-none text-right">
          <div className="text-[15px] font-extrabold tracking-[0.06em]">INVOICE</div>
          <div className="font-bold">{inv.code}</div>
          <div>{fdatetime(inv.date)}</div>
        </div>
      </div>

      <div className="my-2 flex flex-wrap justify-between gap-x-4">
        <span>Pelanggan: <b>{inv.customer?.name ?? "Pelanggan Umum"}</b></span>
        <span>No. PO: {inv.orderCode ?? "—"} · Kasir: {inv.cashier}</span>
      </div>

      {/* A long table breaks between rows, and the browser repeats its header row on each page. */}
      <table className={PAPER_TABLE}>
        <thead>
          <tr>
            <th className="w-9 text-left">No</th>
            <th className="w-full text-left">Barang</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Harga</th>
            <th className="text-right">Diskon</th>
            <th className="text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <div className="font-semibold">{l.name}</div>
                <div className="text-[11px] text-slate-7">{l.code}</div>
              </td>
              <td className="whitespace-nowrap text-right">{num(l.qty)} {l.unit}</td>
              <td className="whitespace-nowrap text-right">{rp(l.unitPrice)}</td>
              <td className="whitespace-nowrap text-right">{l.discount ? rp(l.discount) : "—"}</td>
              <td className="whitespace-nowrap text-right font-semibold">{rp(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* One block, so a page break never separates the total from its sum. */}
      <div className="ml-auto mt-2 w-[260px] max-w-full break-inside-avoid">
        {sums.map(([label, value]) => (
          <div key={label} className="flex justify-between py-0.5">
            <span>{label}</span>
            <span>{value}</span>
          </div>
        ))}
        <div className="flex justify-between border-t-2 border-ink py-1 text-[15px] font-extrabold">
          <span>TOTAL</span>
          <span>{rp(inv.total)}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>{PAYMENT[inv.paymentMethod as Payment] ?? inv.paymentMethod}</span>
          <span>{rp(inv.paid)}</span>
        </div>
      </div>
      {inv.customer && (
        <p className="m-0 mt-2 text-[11px] text-slate-7">
          +{num(inv.pointsEarned)} poin · total poin {num(inv.customer.points)}
        </p>
      )}
    </div>
  );
}
