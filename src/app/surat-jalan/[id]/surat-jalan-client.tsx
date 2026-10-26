"use client";

import { useEffect } from "react";
import Link from "next/link";
import useFetch from "@/components/use-fetch";
import { Loading, ErrorBox } from "@/components/ui";
import { num, fday, fdatetime } from "@/lib/format";
import { mergeLines, type DeliveryLine } from "@/lib/delivery";

type Customer = { id: number; code: string; name: string; address: string | null; phone: string | null };

type Invoice = { id: number; code: string; date: string; cashier: string; lines: DeliveryLine[] };

type Detail = {
  id: number; code: string; date: string; note: string | null; createdBy: string;
  store: { name: string; address: string | null; phone: string | null };
  vehicle: { vehicleNo: string; vehicleType: string };
  driver: string | null; driverAssistance: string | null;
  notes: { id: number; code: string; customer: Customer | null; invoices: Invoice[] }[];
};

type Note = Detail["notes"][number];

const WALK_IN = "Pelanggan Umum";

/** Ruled table for paper: every cell boxed, rows kept whole across page breaks. */
const TABLE =
  "w-full border-collapse [&_tr]:break-inside-avoid [&_td]:border [&_td]:px-2 [&_td]:py-1 " +
  "[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-[9.5px] [&_th]:font-extrabold " +
  "[&_th]:uppercase [&_th]:tracking-[0.08em]";

export default function SuratJalanClient({ id, noteId }: { id: number; noteId: number | null }) {
  const { data, loading, error } = useFetch<Detail>(`/api/deliveries?id=${id}`);
  const notes = (data?.notes ?? []).filter((n) => noteId === null || n.id === noteId);

  // The page title is the default file name when printing to PDF.
  const title = data ? `Surat jalan ${notes.length === 1 ? notes[0].code : data.code}` : null;
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  return (
    <div className="min-h-screen bg-slate-3 print:bg-white">
      <style>{"@page { size: A4; margin: 12mm; }"}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-slate-9 px-6 py-3 text-white">
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pengiriman" className="text-slate-3 no-underline hover:text-white">
            ← Pengiriman
          </Link>
          <span className="font-semibold">
            {data ? `${data.code} · ${notes.length} surat jalan` : "Surat jalan"}
          </span>
        </div>
        <button className="btn btn-primary h-10 px-5" onClick={() => window.print()} disabled={notes.length === 0}>
          Cetak
        </button>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && notes.length === 0 && <ErrorBox message="Surat jalan tidak ditemukan di pengiriman ini." />}
      {data && notes.map((n) => <Sheet key={n.id} delivery={data} note={n} />)}
    </div>
  );
}

function Sheet({ delivery: d, note: n }: { delivery: Detail; note: Note }) {
  const items = mergeLines(n.invoices);
  const c = n.customer;

  return (
    <article className="mx-auto my-6 w-full max-w-[210mm] bg-white p-[12mm] text-[11.5px] leading-snug text-ink shadow-lg [print-color-adjust:exact] print:m-0 print:max-w-none print:break-after-page print:p-0 print:shadow-none print:last:break-after-auto">
      <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-3">
        <div>
          <div className="text-[18px] font-extrabold tracking-[0.06em]">KASAKU</div>
          <div className="font-semibold">{d.store.name}</div>
          {d.store.address && <div>{d.store.address}</div>}
          {d.store.phone && <div>Telp. {d.store.phone}</div>}
        </div>
        <div className="text-right">
          <div className="text-[22px] font-extrabold leading-none tracking-[0.08em]">SURAT JALAN</div>
          <dl className="m-0 mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5">
            <dt className="text-slate-7">No.</dt>
            <dd className="m-0 font-bold">{n.code}</dd>
            <dt className="text-slate-7">Tanggal kirim</dt>
            <dd className="m-0 font-bold">{fday(d.date)}</dd>
            <dt className="text-slate-7">No. pengiriman</dt>
            <dd className="m-0">{d.code}</dd>
          </dl>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 print:grid-cols-3">
        <Box title="Kepada / penerima">
          <div className="text-[13.5px] font-bold">{c?.name ?? WALK_IN}</div>
          {c && <div className="text-slate-7">{c.code}</div>}
          {c?.address ? <div className="mt-1">{c.address}</div> : <BlankLines label="Alamat" />}
          {c?.phone && <div>Telp. {c.phone}</div>}
        </Box>
        <Box title="Kendaraan">
          <Field label="No. polisi" value={d.vehicle.vehicleNo} strong />
          <Field label="Jenis" value={d.vehicle.vehicleType} />
          <Field label="Sopir" value={d.driver ?? "—"} />
          <Field label="Kenek" value={d.driverAssistance ?? "—"} />
        </Box>
        <Box title={`Faktur penjualan (${n.invoices.length})`}>
          {n.invoices.map((inv) => (
            <div key={inv.id} className="flex justify-between gap-2">
              <span className="font-bold">{inv.code}</span>
              <span>{fdatetime(inv.date)}</span>
            </div>
          ))}
        </Box>
      </section>

      <section className="mt-5">
        <SectionTitle>Daftar barang</SectionTitle>
        <table className={`${TABLE} [&_td]:border-ink [&_th]:border-ink [&_th]:bg-slate-2`}>
          <thead>
            <tr>
              <th className="w-[30px]">No</th>
              <th className="w-[100px]">Kode</th>
              <th>Nama barang</th>
              <th className="w-[90px] text-right">Jumlah</th>
              <th className="w-[70px]">Satuan</th>
              <th className="w-[44px] text-center">Cek</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.itemId}>
                <td>{i + 1}</td>
                <td>{it.code}</td>
                <td className="font-semibold">{it.name}</td>
                <td className="text-right text-[13px] font-extrabold">{num(it.qty)}</td>
                <td>{it.unit}</td>
                <td className="text-center">
                  <span className="inline-block h-3.5 w-3.5 border border-ink align-middle" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="text-slate-7">
                {items.length} jenis barang, gabungan dari {n.invoices.length} faktur. Rinciannya per faktur ada di bawah.
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="mt-5">
        <SectionTitle>Rincian per faktur</SectionTitle>
        {n.invoices.map((inv) => (
          <div key={inv.id} className="mb-3 break-inside-avoid">
            <div className="flex flex-wrap justify-between gap-2 bg-slate-2 px-2 py-1 text-[11px]">
              <span className="font-bold">{inv.code}</span>
              <span>
                {fdatetime(inv.date)} · Kasir {inv.cashier}
              </span>
            </div>
            <table className={`${TABLE} text-[10.5px] [&_td]:border-slate-5 [&_th]:border-slate-5`}>
              <thead>
                <tr>
                  <th className="w-[30px]">No</th>
                  <th className="w-[100px]">Kode</th>
                  <th>Nama barang</th>
                  <th className="w-[90px] text-right">Jumlah</th>
                  <th className="w-[70px]">Satuan</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{l.code}</td>
                    <td>{l.name}</td>
                    <td className="text-right font-semibold">{num(l.qty)}</td>
                    <td>{l.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      {d.note && (
        <section className="mt-3 border border-ink px-2.5 py-1.5">
          <span className="font-bold">Catatan:</span> {d.note}
        </section>
      )}

      <section className="mt-6 grid grid-cols-3 gap-8 text-center break-inside-avoid">
        {[
          ["Dibuat oleh", d.createdBy],
          ["Pengemudi", d.driver],
          ["Penerima", c?.name],
        ].map(([label, name]) => (
          <div key={label}>
            <div>{label}</div>
            <div className="mt-16 border-b border-ink" />
            <div className="mt-1">({name || "…………………………"})</div>
          </div>
        ))}
      </section>
      <p className="mb-0 mt-3 text-[10px] text-slate-7">
        Barang di atas sudah diterima dalam keadaan baik dan jumlah sesuai. Dicetak {fdatetime(new Date())}.
      </p>
    </article>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="m-0 mb-1.5 text-[12px] font-extrabold uppercase tracking-[0.1em]">{children}</h2>;
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-ink p-2.5">
      <div className="mb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-slate-7">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-7">{label}</span>
      <span className={strong ? "font-bold" : undefined}>{value}</span>
    </div>
  );
}

/** Ruled lines to write on by hand when the address isn't on record. */
function BlankLines({ label }: { label: string }) {
  return (
    <div className="mt-1">
      <div className="text-slate-7">{label}:</div>
      <div className="mt-4 border-b border-slate-5" />
      <div className="mt-4 border-b border-slate-5" />
    </div>
  );
}
