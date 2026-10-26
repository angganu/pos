"use client";

import { Fragment, useEffect } from "react";
import Link from "next/link";
import useFetch from "@/components/use-fetch";
import { Loading, ErrorBox } from "@/components/ui";
import { num, fday, fdate } from "@/lib/format";
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

/*
 * Sizes are in points, the unit of paper: 8pt body, 6.5pt labels, 14pt title.
 * Text never wraps — a line too long for its space ends in "…" instead.
 */

/** Ruled table for paper: every cell boxed, one line per row, rows kept whole across page breaks. */
const TABLE =
  "w-full border-collapse [&_tr]:break-inside-avoid [&_td]:border [&_td]:px-1.5 [&_td]:py-[3px] " +
  "[&_td]:whitespace-nowrap [&_th]:border [&_th]:px-1.5 [&_th]:py-[3px] [&_th]:text-left [&_th]:text-[6.5pt] " +
  "[&_th]:font-extrabold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:whitespace-nowrap";

/** Header of a table's widest column (the item name): it takes whatever the other columns leave. */
const FILL_TH = "w-full";
/** Its cells: cut with "…" rather than wrap or push the table off the page. */
const FILL_TD = "max-w-0 overflow-hidden text-ellipsis";
/** One line of text that may be cut with "…". */
const LINE = "overflow-hidden text-ellipsis whitespace-nowrap";

/** One A4 sheet on screen; on paper, every sheet after the first starts a new page. */
const PAPER =
  "mx-auto my-6 w-full max-w-[210mm] bg-white p-[12mm] text-[8pt] leading-[1.35] text-ink shadow-lg " +
  "[print-color-adjust:exact] print:m-0 print:max-w-none print:break-after-page print:p-0 print:shadow-none " +
  "print:last:break-after-auto";

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
      <style>{"@page { size: A4 portrait; margin: 12mm; }"}</style>

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
      {data &&
        notes.map((n) => (
          <Fragment key={n.id}>
            <Sheet delivery={data} note={n} />
            <InvoiceDetails delivery={data} note={n} />
          </Fragment>
        ))}
    </div>
  );
}

function Sheet({ delivery: d, note: n }: { delivery: Detail; note: Note }) {
  const items = mergeLines(n.invoices);
  const c = n.customer;

  return (
    <article className={PAPER}>
      <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11pt] font-extrabold leading-tight tracking-[0.06em]">KASAKU</div>
          <div className={`${LINE} font-semibold`}>{d.store.name}</div>
          {d.store.address && <div className={LINE}>{d.store.address}</div>}
          {d.store.phone && <div className={LINE}>Telp. {d.store.phone}</div>}
        </div>
        <div className="flex-none text-right">
          <div className="text-[14pt] font-extrabold leading-none tracking-[0.08em]">SURAT JALAN</div>
          <MetaList
            rows={[
              ["No.", n.code, true],
              ["Tanggal kirim", fday(d.date), true],
              ["No. pengiriman", d.code],
            ]}
          />
        </div>
      </header>

      <section className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[3fr_2fr_2.4fr] print:grid-cols-[3fr_2fr_2.4fr]">
        <Box title="Kepada / penerima">
          <div className={`${LINE} text-[9.5pt] font-bold leading-tight`}>{c?.name ?? WALK_IN}</div>
          {c && <div className={`${LINE} text-slate-7`}>{c.code}</div>}
          {c?.address ? <div className={`${LINE} mt-0.5`}>{c.address}</div> : <BlankLines label="Alamat" />}
          {c?.phone && <div className={LINE}>Telp. {c.phone}</div>}
        </Box>
        <Box title="Kendaraan">
          <Field label="No. polisi" value={d.vehicle.vehicleNo} strong />
          <Field label="Jenis" value={d.vehicle.vehicleType} />
          <Field label="Sopir" value={d.driver ?? "—"} />
          <Field label="Kenek" value={d.driverAssistance ?? "—"} />
        </Box>
        <Box title={`Faktur penjualan (${n.invoices.length})`}>
          {n.invoices.map((inv) => (
            <Field key={inv.id} label={inv.code} value={fdate(inv.date)} labelStrong />
          ))}
        </Box>
      </section>

      <section className="mt-4">
        <SectionTitle>Daftar barang</SectionTitle>
        <table className={`${TABLE} [&_td]:border-ink [&_th]:border-ink [&_th]:bg-slate-2`}>
          <thead>
            <tr>
              <th>No</th>
              <th>Kode</th>
              <th className={FILL_TH}>Nama barang</th>
              <th className="text-right">Jumlah</th>
              <th>Satuan</th>
              <th className="text-center">Cek</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.itemId}>
                <td>{i + 1}</td>
                <td>{it.code}</td>
                <td className={`${FILL_TD} font-semibold`}>{it.name}</td>
                <td className="text-right text-[9pt] font-extrabold">{num(it.qty)}</td>
                <td>{it.unit}</td>
                <td className="text-center">
                  <span className="inline-block h-3 w-3 border border-ink align-middle" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="text-[7pt] text-slate-7">
                {items.length} jenis barang, gabungan dari {n.invoices.length} faktur. Rincian per faktur ada di
                halaman lampiran.
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* The note is the one free-text paragraph, so it may run over more than one line. */}
      {d.note && (
        <section className="mt-2.5 border border-ink px-2 py-1">
          <span className="font-bold">Catatan:</span> {d.note}
        </section>
      )}

      <section className="mt-5 grid grid-cols-3 gap-8 text-center break-inside-avoid">
        {[
          ["Dibuat oleh", d.createdBy],
          ["Pengemudi", d.driver],
          ["Penerima", c?.name],
        ].map(([label, name]) => (
          <div key={label} className="min-w-0">
            <div>{label}</div>
            <div className="mt-12 border-b border-ink" />
            <div className={`${LINE} mt-0.5`}>({name || "…………………………"})</div>
          </div>
        ))}
      </section>
      <p className={`${LINE} mb-0 mt-2.5 text-[6.5pt] text-slate-7`}>
        Barang di atas sudah diterima dalam keadaan baik dan jumlah sesuai. Dicetak {fdate(new Date())}.
      </p>
    </article>
  );
}

/** The surat jalan's attachment: each invoice's own lines, starting on a fresh page. */
function InvoiceDetails({ delivery: d, note: n }: { delivery: Detail; note: Note }) {
  return (
    <article className={PAPER}>
      <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11pt] font-extrabold leading-tight tracking-[0.06em]">KASAKU</div>
          <div className={`${LINE} font-semibold`}>{d.store.name}</div>
        </div>
        <div className="flex-none text-right">
          <div className="text-[11pt] font-extrabold leading-none tracking-[0.08em]">RINCIAN PER FAKTUR</div>
          <div className="mt-0.5 text-slate-7">Lampiran surat jalan</div>
          <MetaList
            rows={[
              ["No. surat jalan", n.code, true],
              ["Kepada", n.customer?.name ?? WALK_IN, true],
              ["Tanggal kirim", fday(d.date)],
            ]}
          />
        </div>
      </header>

      <p className={`${LINE} mb-2 mt-2.5 text-slate-7`}>
        {n.invoices.length} faktur yang jumlahnya digabung di surat jalan {n.code}.
      </p>

      {n.invoices.map((inv) => (
        <div key={inv.id} className="mb-2.5 break-inside-avoid">
          <div className="flex justify-between gap-3 whitespace-nowrap bg-slate-2 px-1.5 py-[3px] text-[7.5pt]">
            <span className="font-bold">{inv.code}</span>
            <span className={LINE}>
              {fdate(inv.date)} · Kasir {inv.cashier}
            </span>
          </div>
          <table className={`${TABLE} text-[7.5pt] [&_td]:border-slate-5 [&_th]:border-slate-5`}>
            <thead>
              <tr>
                <th>No</th>
                <th>Kode</th>
                <th className={FILL_TH}>Nama barang</th>
                <th className="text-right">Jumlah</th>
                <th>Satuan</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{l.code}</td>
                  <td className={FILL_TD}>{l.name}</td>
                  <td className="text-right font-semibold">{num(l.qty)}</td>
                  <td>{l.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </article>
  );
}

/** Right-aligned label/value pairs under a sheet's title. */
function MetaList({ rows }: { rows: [label: string, value: string, strong?: boolean][] }) {
  return (
    <dl className="m-0 mt-1.5 grid grid-cols-[auto_auto] justify-end gap-x-3 whitespace-nowrap">
      {rows.map(([label, value, strong]) => (
        <Fragment key={label}>
          <dt className="text-slate-7">{label}</dt>
          <dd className={strong ? "m-0 font-bold" : "m-0"}>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="m-0 mb-1 text-[7.5pt] font-extrabold uppercase tracking-[0.1em]">{children}</h2>;
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border border-ink px-2 py-1.5">
      <div className="mb-1 whitespace-nowrap text-[6.5pt] font-extrabold uppercase tracking-[0.12em] text-slate-7">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  strong,
  labelStrong,
}: {
  label: string;
  value: string;
  strong?: boolean;
  labelStrong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 whitespace-nowrap">
      <span className={labelStrong ? "flex-none font-bold" : "flex-none text-slate-7"}>{label}</span>
      <span className={`${LINE} ${strong ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

/** Ruled lines to write on by hand when the address isn't on record. */
function BlankLines({ label }: { label: string }) {
  return (
    <div className="mt-0.5">
      <div className="text-slate-7">{label}:</div>
      <div className="mt-3.5 border-b border-slate-5" />
      <div className="mt-3.5 border-b border-slate-5" />
    </div>
  );
}
