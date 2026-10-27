"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { format, subMonths } from "date-fns";
import type { AttendanceStatus, WagePeriod, WageStatus } from "@prisma/client";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState, ErrorBox, Toolbar, Chip, Modal, StatCard, Segmented, Avatar } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { fdate, fday, num, rp } from "@/lib/format";
import {
  ATTENDANCE_LABEL, ATTENDANCE_SHORT, ATTENDANCE_STATUSES, PERIOD_LABEL,
  periodLabel, periodRange, shiftPeriod, wageTotal,
} from "@/lib/wages";

type SavedWage = {
  id: number; workDays: number; dailyWage: number; allowance: number; deduction: number; total: number;
  status: WageStatus; paidAt: string | null; note: string | null;
};
type SheetRow = {
  employeeId: number; name: string; storeLabel: string | null; photoUrl: string | null; wagePeriod: WagePeriod;
  counts: Record<AttendanceStatus, number>; workDays: number; dailyWage: number;
  wage: SavedWage | null; clash: string | null;
};
type Sheet = { period: WagePeriod; start: string; end: string; rows: SheetRow[] };

type HistoryRow = SavedWage & {
  employeeId: number; name: string; storeLabel: string | null; photoUrl: string | null;
  period: WagePeriod; periodStart: string; periodEnd: string; userName: string;
};

/** What a pay slip shows; the sheet also knows the attendance behind the days. */
type Slip = {
  name: string; storeLabel: string | null; period: WagePeriod; start: string; end: string;
  wage: SavedWage; counts?: Record<AttendanceStatus, number>;
};

type Draft = { allowance: string; deduction: string; note: string };
const NO_DRAFT: Draft = { allowance: "", deduction: "", note: "" };

type Confirm = { title: string; body: React.ReactNode; label: string; run: () => Promise<unknown> };

const PERIODS: WagePeriod[] = ["DAILY", "WEEKLY", "MONTHLY"];
const today = () => format(new Date(), "yyyy-MM-dd");

/** Daily workers are paid for today; weekly and monthly ones for the period that just ended. */
function defaultRange(period: WagePeriod) {
  const current = periodRange(period, today());
  return period === "DAILY" ? current : shiftPeriod(period, current.start, -1);
}

const amount = (s: string) => Number(s || 0);

function StatusTag({ wage }: { wage: SavedWage | null }) {
  if (!wage) return <span className="tag tag-neutral">Belum dihitung</span>;
  if (wage.status === "UNPAID") return <span className="tag tag-amber">Belum dibayar</span>;
  return (
    <div>
      <span className="tag tag-teal">Dibayar</span>
      <div className="mt-0.5 text-[11px] text-slate-7">{fdate(wage.paidAt)}</div>
    </div>
  );
}

/** Days × daily wage, the sum on top. */
function BasePay({ days, rate }: { days: number; rate: number }) {
  return (
    <>
      <div className="text-[13px] font-semibold">{rp(days * rate)}</div>
      <div className="whitespace-nowrap text-[11px] text-slate-7">
        {num(days)} hari × {rp(rate)}
      </div>
    </>
  );
}

function Attendance({ counts }: { counts: Record<AttendanceStatus, number> }) {
  const shown = ATTENDANCE_STATUSES.filter((s) => counts[s] > 0);
  if (shown.length === 0) return <span className="text-[13px] text-slate-5">Belum ada absensi</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <span key={s} title={ATTENDANCE_LABEL[s]} className="bg-slate-2 px-1.5 py-0.5 text-[11px] font-semibold">
          {ATTENDANCE_SHORT[s]} {counts[s]}
        </span>
      ))}
    </div>
  );
}

export default function UpahClient() {
  const [tab, setTab] = useState<"periode" | "riwayat">("periode");
  const [editing, setEditing] = useState<{ name: string; wage: SavedWage } | null>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Bumped after every change, so whichever tab is open loads again. */
  const [version, setVersion] = useState(0);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setConfirm(null);
      setEditing(null);
      setVersion((v) => v + 1);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menyimpan.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const actions: WageActions = {
    edit: (name, wage) => {
      setActionError(null);
      setEditing({ name, wage });
    },
    slip: setSlip,
    ask: (c) => {
      setActionError(null);
      setConfirm(c);
    },
    run,
    busy,
  };

  return (
    <div>
      <PageHeader
        kicker="Karyawan / HR"
        title="Upah karyawan"
        subtitle="Upah = hari kerja dari absensi × upah harian + tunjangan − potongan. Setiap karyawan dibayar sesuai periodenya."
      />

      <div className="flex gap-0 px-6 pt-4">
        {(["periode", "riwayat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-4 py-2.5 text-sm font-semibold ring-1 ring-divider transition-colors",
              tab === t ? "bg-ink text-white" : "bg-white hover:bg-slate-2"
            )}
          >
            {t === "periode" ? "Hitung per periode" : "Riwayat upah"}
          </button>
        ))}
      </div>

      {actionError && !editing && !confirm && <ErrorBox message={actionError} />}

      {tab === "periode" ? <PeriodSheet version={version} actions={actions} /> : <History version={version} actions={actions} />}

      <EditModal editing={editing} busy={busy} error={actionError} onClose={() => setEditing(null)} run={run} />

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        width="480px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Batal</button>
            <button className="btn btn-primary" onClick={() => confirm && run(confirm.run)} disabled={busy}>
              {busy ? "Memproses…" : confirm?.label}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5 text-sm">
          {actionError && <div className="bg-brand-100 px-3 py-2 font-semibold text-brand-800">{actionError}</div>}
          {confirm?.body}
        </div>
      </Modal>

      <Modal
        open={slip !== null}
        onClose={() => setSlip(null)}
        title="Slip upah"
        width="560px"
        footer={
          <>
            <button className="btn btn-secondary no-print" onClick={() => setSlip(null)}>Tutup</button>
            <button className="btn btn-primary no-print" onClick={() => window.print()}>
              <Printer size={14} /> Cetak
            </button>
          </>
        }
      >
        {slip && (
          <div className="bg-white p-4 ring-1 ring-divider">
            <SlipSheet slip={slip} />
          </div>
        )}
      </Modal>
      {/* The copy that reaches the paper, outside the modal, like the invoice. */}
      {slip &&
        createPortal(
          <div className="print-only hidden print:block">
            <SlipSheet slip={slip} />
          </div>,
          document.body
        )}
    </div>
  );
}

type WageActions = {
  edit: (name: string, wage: SavedWage) => void;
  slip: (slip: Slip) => void;
  ask: (confirm: Confirm) => void;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  busy: boolean;
};

const pay = (ids: number[], paid: boolean) => api.post("/api/wages/pay", { ids, paid });

/** Row buttons for a saved wage: pay / edit / delete while unpaid, slip / undo once paid. */
function WageButtons({ name, label, wage, actions, onSlip }: {
  name: string; label: string; wage: SavedWage; actions: WageActions; onSlip: () => void;
}) {
  if (wage.status === "PAID") {
    return (
      <>
        <button className="btn btn-ghost px-2.5 text-xs" onClick={onSlip}>Slip</button>
        <button
          className="btn btn-ghost px-2.5 text-xs text-brand-700"
          onClick={() =>
            actions.ask({
              title: "Batalkan pembayaran",
              label: "Batalkan pembayaran",
              body: (
                <p className="m-0">
                  Tandai upah <b>{name}</b> ({label}) belum dibayar? Pakai ini hanya bila pembayarannya tercatat keliru.
                  Absensi pada periode itu jadi bisa diubah lagi.
                </p>
              ),
              run: () => pay([wage.id], false),
            })
          }
        >
          Batal bayar
        </button>
      </>
    );
  }
  return (
    <>
      <button
        className="btn btn-ghost px-2.5 text-xs font-bold text-teal-700"
        onClick={() =>
          actions.ask({
            title: "Bayar upah",
            label: `Bayar ${rp(wage.total)}`,
            body: (
              <p className="m-0">
                Tandai upah <b>{name}</b> ({label}) sebesar <b>{rp(wage.total)}</b> sudah dibayar? Setelah dibayar,
                upahnya tidak bisa diubah dan absensi periode itu terkunci.
              </p>
            ),
            run: () => pay([wage.id], true),
          })
        }
      >
        Bayar
      </button>
      <button className="btn btn-ghost px-2.5 text-xs" onClick={() => actions.edit(name, wage)}>Ubah</button>
      <button
        className="btn btn-ghost px-2.5 text-xs text-brand-700"
        onClick={() =>
          actions.ask({
            title: "Hapus perhitungan upah",
            label: "Hapus",
            body: (
              <p className="m-0">
                Hapus upah <b>{name}</b> ({label})? Absensinya tetap, dan upahnya bisa dihitung ulang dari tab Hitung per
                periode.
              </p>
            ),
            run: () => api.del(`/api/wages?id=${wage.id}`),
          })
        }
      >
        Hapus
      </button>
    </>
  );
}

function PeriodSheet({ version, actions }: { version: number; actions: WageActions }) {
  const { storeId } = useApp();
  const [period, setPeriod] = useState<WagePeriod>("WEEKLY");
  const [range, setRange] = useState(() => defaultRange("WEEKLY"));
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const { data, loading, error } = useFetch<Sheet>(
    `/api/wages${qs({ period, date: range.start, storeId })}`,
    [version]
  );
  const label = periodLabel(period, range.start, range.end);
  const rows = useMemo(() => data?.rows ?? [], [data]);

  function goTo(next: { start: string; end: string }, nextPeriod = period) {
    setPeriod(nextPeriod);
    setRange(next);
    setDrafts({});
    setSkipped(new Set());
    setMsg(null);
  }

  const draft = (r: SheetRow) => drafts[r.employeeId] ?? NO_DRAFT;
  const estimate = (r: SheetRow) => {
    const d = draft(r);
    return wageTotal(r.workDays, r.dailyWage, amount(d.allowance), amount(d.deduction));
  };
  const blocker = (r: SheetRow): string | null => {
    if (r.clash) return `Bentrok dengan upah ${r.clash}`;
    if (r.workDays === 0 && amount(draft(r).allowance) === 0) return "Tidak ada hari kerja";
    if (estimate(r) < 0) return "Potongan melebihi upah";
    return null;
  };

  const open = rows.filter((r) => !r.wage);
  const ready = open.filter((r) => !blocker(r));
  const chosen = ready.filter((r) => !skipped.has(r.employeeId));
  const unpaid = rows.filter((r) => r.wage?.status === "UNPAID");

  const sum = (list: SheetRow[], f: (r: SheetRow) => number) => list.reduce((a, r) => a + f(r), 0);
  const totals = {
    estimate: sum(ready, estimate),
    unpaid: sum(unpaid, (r) => r.wage!.total),
    paid: sum(rows.filter((r) => r.wage?.status === "PAID"), (r) => r.wage!.total),
  };

  function setDraft(r: SheetRow, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [r.employeeId]: { ...(prev[r.employeeId] ?? NO_DRAFT), ...patch } }));
  }

  function toggle(r: SheetRow) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(r.employeeId)) next.delete(r.employeeId);
      else next.add(r.employeeId);
      return next;
    });
  }

  async function saveChosen() {
    const ok = await actions.run(() =>
      api.post("/api/wages", {
        period,
        date: range.start,
        entries: chosen.map((r) => {
          const d = draft(r);
          return { employeeId: r.employeeId, allowance: amount(d.allowance), deduction: amount(d.deduction), note: d.note.trim() || null };
        }),
      })
    );
    if (ok) {
      setMsg(`Upah ${chosen.length} karyawan untuk ${label} tersimpan, menunggu dibayar.`);
      setDrafts({});
      setSkipped(new Set());
    }
  }

  function payAll() {
    actions.ask({
      title: "Bayar semua upah",
      label: `Bayar ${rp(totals.unpaid)}`,
      body: (
        <p className="m-0">
          Tandai upah <b>{unpaid.length} karyawan</b> untuk {label}, total <b>{rp(totals.unpaid)}</b>, sudah dibayar?
          Setelah dibayar, upahnya tidak bisa diubah dan absensi periode itu terkunci.
        </p>
      ),
      run: () => pay(unpaid.map((r) => r.wage!.id), true),
    });
  }

  const ongoing = range.end >= today();
  const allChosen = ready.length > 0 && chosen.length === ready.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 px-6 pt-4">
        <div className="w-[300px]">
          <Segmented
            value={period}
            onChange={(p) => goTo(defaultRange(p), p)}
            options={PERIODS.map((p) => [p, PERIOD_LABEL[p]])}
          />
        </div>
        <div className="flex items-center">
          <button className="btn btn-secondary h-10 px-2.5" onClick={() => goTo(shiftPeriod(period, range.start, -1))} aria-label="Periode sebelumnya">
            <ChevronLeft size={16} />
          </button>
          <div className="flex h-10 min-w-[200px] items-center justify-center bg-white px-3 text-sm font-semibold ring-1 ring-divider">
            {label}
          </div>
          <button className="btn btn-secondary h-10 px-2.5" onClick={() => goTo(shiftPeriod(period, range.start, 1))} aria-label="Periode berikutnya">
            <ChevronRight size={16} />
          </button>
        </div>
        <input
          type="date"
          className="input h-10 w-[160px]"
          aria-label="Lompat ke tanggal"
          title="Lompat ke periode yang memuat tanggal ini"
          value=""
          onChange={(e) => e.target.value && goTo(periodRange(period, e.target.value))}
        />
      </div>

      {ongoing && (
        <div className="mx-6 mt-3 bg-amber-100 px-4 py-2.5 text-[13px] font-semibold text-amber-700 ring-1 ring-amber-300">
          Periode ini belum selesai. Upah yang dihitung sekarang ikut dihitung ulang setiap kali absensinya diubah,
          sampai upahnya dibayar.
        </div>
      )}
      {msg && (
        <div role="status" className="mx-6 mt-3 bg-teal-200 px-4 py-3 text-sm font-semibold text-teal-700 ring-1 ring-teal-400">
          {msg}
        </div>
      )}
      {error && <ErrorBox message={error} />}

      <div className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-4">
        <StatCard label="Karyawan" value={rows.length} hint={`dibayar ${PERIOD_LABEL[period].toLowerCase()}`} />
        <StatCard label="Belum dihitung" value={rp(totals.estimate)} hint={`${ready.length} karyawan siap dihitung`} />
        <StatCard label="Belum dibayar" value={rp(totals.unpaid)} hint={`${unpaid.length} karyawan`} emphasis={unpaid.length > 0} />
        <StatCard label="Sudah dibayar" value={rp(totals.paid)} />
      </div>

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState
            title={`Tidak ada karyawan dengan upah ${PERIOD_LABEL[period].toLowerCase()} pada periode ini.`}
            hint="Periode upah tiap karyawan diatur di Data Karyawan."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl min-w-[1150px]">
                <thead>
                  <tr>
                    <th className="w-[36px]">
                      <input
                        type="checkbox"
                        aria-label="Pilih semua yang siap dihitung"
                        className="h-4 w-4 accent-brand-600"
                        checked={allChosen}
                        disabled={ready.length === 0}
                        onChange={() => setSkipped(allChosen ? new Set(ready.map((r) => r.employeeId)) : new Set())}
                      />
                    </th>
                    <th className="min-w-[200px]">Karyawan</th>
                    <th className="w-[140px]">Absensi</th>
                    <th className="w-[160px] text-right">Upah pokok</th>
                    <th className="w-[110px] text-right">Tunjangan</th>
                    <th className="w-[110px] text-right">Potongan</th>
                    <th className="w-[120px] text-right">Total</th>
                    <th className="w-[120px]">Status</th>
                    <th className="w-[150px]" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const w = r.wage;
                    const d = draft(r);
                    const why = w ? null : blocker(r);
                    const days = w ? w.workDays : r.workDays;
                    const rate = w ? w.dailyWage : r.dailyWage;
                    return (
                      <tr key={r.employeeId}>
                        <td>
                          {!w && (
                            <input
                              type="checkbox"
                              aria-label={`Hitung upah ${r.name}`}
                              className="h-4 w-4 accent-brand-600"
                              checked={!why && !skipped.has(r.employeeId)}
                              disabled={Boolean(why)}
                              onChange={() => toggle(r)}
                            />
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={r.name} src={r.photoUrl} size={32} />
                            <div className="min-w-0">
                              <div className="whitespace-nowrap text-sm font-semibold">{r.name}</div>
                              <div className="whitespace-nowrap text-[11px] text-slate-7">
                                {r.storeLabel ?? "Semua toko"}
                                {r.wagePeriod !== period && ` · kini ${PERIOD_LABEL[r.wagePeriod].toLowerCase()}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td><Attendance counts={r.counts} /></td>
                        <td className="text-right"><BasePay days={days} rate={rate} /></td>
                        {w ? (
                          <>
                            <td className="text-right text-[13px]">{w.allowance ? rp(w.allowance) : "—"}</td>
                            <td className="text-right text-[13px]">{w.deduction ? `– ${rp(w.deduction)}` : "—"}</td>
                          </>
                        ) : (
                          <>
                            <td>
                              <input
                                type="number" min={0} step={1000} placeholder="0" aria-label={`Tunjangan ${r.name}`}
                                className="input h-8 text-right text-[13px]" value={d.allowance} disabled={Boolean(r.clash)}
                                onChange={(e) => setDraft(r, { allowance: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                type="number" min={0} step={1000} placeholder="0" aria-label={`Potongan ${r.name}`}
                                className="input h-8 text-right text-[13px]" value={d.deduction} disabled={Boolean(r.clash)}
                                onChange={(e) => setDraft(r, { deduction: e.target.value })}
                              />
                            </td>
                          </>
                        )}
                        <td className="whitespace-nowrap text-right text-sm font-extrabold">{rp(w ? w.total : estimate(r))}</td>
                        <td className="whitespace-nowrap">
                          <StatusTag wage={w} />
                          {why && <div className="mt-0.5 text-[11px] font-semibold text-amber-700">{why}</div>}
                          {w?.note && <div className="mt-0.5 text-[11px] text-slate-7">{w.note}</div>}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          {w && (
                            <WageButtons
                              name={r.name}
                              label={label}
                              wage={w}
                              actions={actions}
                              onSlip={() =>
                                actions.slip({ name: r.name, storeLabel: r.storeLabel, period, start: range.start, end: range.end, wage: w, counts: r.counts })
                              }
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {unpaid.length > 0 && (
                <button className="btn btn-secondary" onClick={payAll} disabled={actions.busy}>
                  Bayar semua yang belum dibayar ({unpaid.length})
                </button>
              )}
              <button className="btn btn-primary ml-auto h-11 px-5" onClick={saveChosen} disabled={actions.busy || chosen.length === 0}>
                {actions.busy ? "Menyimpan…" : `Simpan upah terpilih (${chosen.length}) · ${rp(sum(chosen, estimate))}`}
              </button>
            </div>
            <p className="mt-2.5 text-xs text-slate-7">
              Upah yang disimpan memakai upah harian saat ini dan menunggu dibayar. Untuk menghitung ulang dengan upah harian
              baru, hapus lalu simpan lagi.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function History({ version, actions }: { version: number; actions: WageActions }) {
  const { storeId } = useApp();
  const [status, setStatus] = useState<WageStatus | "all">("all");
  const [period, setPeriod] = useState<WagePeriod | "all">("all");
  const [from, setFrom] = useState(() => format(subMonths(new Date(), 3), "yyyy-MM-01"));
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");

  const { data, loading, error } = useFetch<HistoryRow[]>(
    `/api/wages${qs({ status: status === "all" ? null : status, from, to, storeId })}`,
    [version]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (w) => (period === "all" || w.period === period) && (!needle || w.name.toLowerCase().includes(needle))
    );
  }, [data, period, q]);

  const total = rows.reduce((a, w) => a + w.total, 0);
  const unpaid = rows.filter((w) => w.status === "UNPAID").reduce((a, w) => a + w.total, 0);

  return (
    <>
      <Toolbar>
        <input
          className="input h-10 max-w-[260px]"
          placeholder="Cari karyawan…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex items-center gap-1.5">
          <input type="date" className="input h-10 w-[150px]" aria-label="Dari tanggal" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-6">–</span>
          <input type="date" className="input h-10 w-[150px]" aria-label="Sampai tanggal" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Chip active={status === "all"} onClick={() => setStatus("all")}>Semua</Chip>
        <Chip active={status === "UNPAID"} onClick={() => setStatus("UNPAID")}>Belum dibayar</Chip>
        <Chip active={status === "PAID"} onClick={() => setStatus("PAID")}>Dibayar</Chip>
        <span className="mx-1 h-6 w-px bg-divider" aria-hidden />
        <Chip active={period === "all"} onClick={() => setPeriod("all")}>Semua periode</Chip>
        {PERIODS.map((p) => (
          <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
            {PERIOD_LABEL[p]}
          </Chip>
        ))}
      </Toolbar>

      {error && <ErrorBox message={error} />}

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState title="Tidak ada upah yang cocok dengan filter." />
        ) : (
          <div className="table-wrap">
            <table className="tbl min-w-[1150px]">
              <thead>
                <tr>
                  <th className="min-w-[200px]">Karyawan</th>
                  <th className="w-[170px]">Periode</th>
                  <th className="w-[160px] text-right">Upah pokok</th>
                  <th className="w-[110px] text-right">Tunjangan</th>
                  <th className="w-[110px] text-right">Potongan</th>
                  <th className="w-[120px] text-right">Total</th>
                  <th className="w-[120px]">Status</th>
                  <th className="w-[150px]" />
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => {
                  const label = periodLabel(w.period, w.periodStart, w.periodEnd);
                  return (
                    <tr key={w.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={w.name} src={w.photoUrl} size={30} />
                          <div className="min-w-0">
                            <div className="whitespace-nowrap text-sm font-semibold">{w.name}</div>
                            <div className="whitespace-nowrap text-[11px] text-slate-7">{w.storeLabel ?? "Semua toko"}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="whitespace-nowrap text-[13px]">{label}</div>
                        <div className="text-[11px] text-slate-7">{PERIOD_LABEL[w.period]}</div>
                      </td>
                      <td className="text-right"><BasePay days={w.workDays} rate={w.dailyWage} /></td>
                      <td className="text-right text-[13px]">{w.allowance ? rp(w.allowance) : "—"}</td>
                      <td className="text-right text-[13px]">{w.deduction ? `– ${rp(w.deduction)}` : "—"}</td>
                      <td className="whitespace-nowrap text-right text-sm font-extrabold">{rp(w.total)}</td>
                      <td className="whitespace-nowrap">
                        <StatusTag wage={w} />
                        {w.note && <div className="mt-0.5 text-[11px] text-slate-7">{w.note}</div>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <WageButtons
                          name={w.name}
                          label={label}
                          wage={w}
                          actions={actions}
                          onSlip={() =>
                            actions.slip({ name: w.name, storeLabel: w.storeLabel, period: w.period, start: w.periodStart, end: w.periodEnd, wage: w })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink text-sm font-extrabold">
                  <td className="px-3 py-2.5" colSpan={5}>
                    {rows.length} upah{unpaid > 0 && <span className="ml-2 font-semibold text-amber-700">· belum dibayar {rp(unpaid)}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">{rp(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function EditModal({ editing, busy, error, onClose, run }: {
  editing: { name: string; wage: SavedWage } | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [form, setForm] = useState<Draft>(NO_DRAFT);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  // Fill the form when another wage opens — during render, as React suggests for state
  // that follows a prop, so it never shows the previous wage for a frame.
  if (editing && loadedFor !== editing.wage.id) {
    setLoadedFor(editing.wage.id);
    setForm({
      allowance: editing.wage.allowance ? String(editing.wage.allowance) : "",
      deduction: editing.wage.deduction ? String(editing.wage.deduction) : "",
      note: editing.wage.note ?? "",
    });
  }
  if (!editing && loadedFor !== null) setLoadedFor(null);

  const w = editing?.wage;
  const total = w ? wageTotal(w.workDays, w.dailyWage, amount(form.allowance), amount(form.deduction)) : 0;

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={`Ubah upah — ${editing?.name ?? ""}`}
      width="480px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Batal</button>
          <button
            className="btn btn-primary"
            disabled={busy || total < 0}
            onClick={() =>
              w &&
              run(() =>
                api.patch("/api/wages", {
                  id: w.id, allowance: amount(form.allowance), deduction: amount(form.deduction), note: form.note.trim() || null,
                })
              )
            }
          >
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </>
      }
    >
      {w && (
        <div className="flex flex-col gap-3.5">
          {error && <div className="bg-brand-100 px-3 py-2 text-sm font-semibold text-brand-800">{error}</div>}
          <div className="text-sm">
            {num(w.workDays)} hari × {rp(w.dailyWage)} = <b>{rp(w.workDays * w.dailyWage)}</b>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div className="field">
              <label htmlFor="allowance">Tunjangan / bonus (Rp)</label>
              <input id="allowance" type="number" min={0} step={1000} className="input h-10 text-right" value={form.allowance}
                onChange={(e) => setForm({ ...form, allowance: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="deduction">Potongan / kasbon (Rp)</label>
              <input id="deduction" type="number" min={0} step={1000} className="input h-10 text-right" value={form.deduction}
                onChange={(e) => setForm({ ...form, deduction: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="note">Catatan</label>
            <input id="note" className="input h-10" maxLength={255} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className={clsx("text-right text-lg font-extrabold", total < 0 && "text-brand-700")}>
            Total {rp(total)}
            {total < 0 && <div className="text-xs font-semibold">Potongan melebihi upah.</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** The pay slip as it goes on paper; the modal previews the same sheet. */
function SlipSheet({ slip }: { slip: Slip }) {
  const { wage: w } = slip;
  const lines: [string, string][] = [
    [`Upah pokok (${num(w.workDays)} hari × ${rp(w.dailyWage)})`, rp(w.workDays * w.dailyWage)],
    ["Tunjangan / bonus", rp(w.allowance)],
    ["Potongan / kasbon", `– ${rp(w.deduction)}`],
  ];
  return (
    <div className="text-[13px] leading-snug text-ink">
      <div className="flex items-start justify-between gap-4 border-b-2 border-ink pb-2">
        <div>
          <div className="text-[15px] font-extrabold tracking-[0.06em]">KASAKU</div>
          <div>{slip.storeLabel ?? "Semua toko"}</div>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-extrabold tracking-[0.06em]">SLIP UPAH</div>
          <div>{PERIOD_LABEL[slip.period]} · {periodLabel(slip.period, slip.start, slip.end)}</div>
        </div>
      </div>

      <div className="my-3">
        <div className="text-base font-extrabold">{slip.name}</div>
        <div className="text-slate-7">
          Periode {fday(slip.start)}{slip.start !== slip.end && ` – ${fday(slip.end)}`}
        </div>
      </div>

      {slip.counts && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
          {ATTENDANCE_STATUSES.map((s) => (
            <span key={s}>{ATTENDANCE_LABEL[s]}: <b>{slip.counts![s]}</b></span>
          ))}
        </div>
      )}

      <table className="w-full border-collapse">
        <tbody>
          {lines.map(([k, v]) => (
            <tr key={k} className="border-b border-divider">
              <td className="py-1.5">{k}</td>
              <td className="py-1.5 text-right">{v}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink text-base font-extrabold">
            <td className="py-2">Total diterima</td>
            <td className="py-2 text-right">{rp(w.total)}</td>
          </tr>
        </tbody>
      </table>

      {w.note && <div className="mt-2">Catatan: {w.note}</div>}
      <div className="mt-2">
        Status: <b>{w.status === "PAID" ? `Dibayar ${fdate(w.paidAt)}` : "Belum dibayar"}</b>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-8 text-center">
        <div>
          Diterima oleh
          <div className="mt-14 border-t border-ink pt-1 font-semibold">{slip.name}</div>
        </div>
        <div>
          Dibayar oleh
          <div className="mt-14 border-t border-ink pt-1">&nbsp;</div>
        </div>
      </div>
    </div>
  );
}
