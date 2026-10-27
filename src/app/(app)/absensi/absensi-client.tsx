"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { format } from "date-fns";
import type { AttendanceStatus, WagePeriod } from "@prisma/client";
import { ChevronLeft, ChevronRight, Download, Lock } from "lucide-react";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState, ErrorBox, Avatar } from "@/components/ui";
import { api, qs } from "@/lib/client";
import { num } from "@/lib/format";
import {
  ATTENDANCE_LABEL, ATTENDANCE_SHORT, ATTENDANCE_STATUSES, PERIOD_LABEL, addDays, parseDay, periodRange, shiftPeriod,
} from "@/lib/wages";

type DayRow = {
  employeeId: number; name: string; storeLabel: string | null; photoUrl: string | null;
  wagePeriod: WagePeriod; status: AttendanceStatus | null; note: string | null; lockedBy: string | null;
};
type DaySheet = { date: string; rows: DayRow[] };

type RecapRow = {
  employeeId: number; name: string; storeLabel: string | null; photoUrl: string | null;
  joinedAt: string; resignAt: string | null;
  marks: Record<string, AttendanceStatus>; counts: Record<AttendanceStatus, number>; workDays: number;
};
type Recap = { from: string; to: string; days: string[]; rows: RecapRow[] };

type Entry = { status: AttendanceStatus | null; note: string };

const BUTTON_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Hadir", HALF_DAY: "½ hari", LEAVE: "Izin", SICK: "Sakit", ABSENT: "Alpa",
};

/** Solid when picked on the daily sheet, soft in the recap grid. */
const TONE: Record<AttendanceStatus, { on: string; soft: string }> = {
  PRESENT: { on: "bg-teal-600 text-white", soft: "bg-teal-200 text-teal-700" },
  HALF_DAY: { on: "bg-amber-500 text-white", soft: "bg-amber-200 text-amber-700" },
  LEAVE: { on: "bg-brand-600 text-white", soft: "bg-brand-200 text-brand-800" },
  SICK: { on: "bg-violet-600 text-white", soft: "bg-violet-200 text-violet-700" },
  ABSENT: { on: "bg-slate-8 text-white", soft: "bg-slate-3 text-slate-8" },
};

const WEEKDAY = ["M", "S", "S", "R", "K", "J", "S"];
const LONG_DATE = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

const today = () => format(new Date(), "yyyy-MM-dd");

function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return rows.map((r) => r.map(esc).join(";")).join("\n");
}

export default function AbsensiClient() {
  const [tab, setTab] = useState<"harian" | "rekap">("harian");

  return (
    <div>
      <PageHeader
        kicker="Karyawan / HR"
        title="Absensi karyawan"
        subtitle="Hari kerja dari absensi menjadi dasar upah: hadir = 1 hari, setengah hari = ½, izin/sakit/alpa tidak dibayar."
      />

      <div className="flex gap-0 px-6 pt-4">
        {(["harian", "rekap"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-4 py-2.5 text-sm font-semibold ring-1 ring-divider transition-colors",
              tab === t ? "bg-ink text-white" : "bg-white hover:bg-slate-2"
            )}
          >
            {t === "harian" ? "Input harian" : "Rekap bulanan"}
          </button>
        ))}
      </div>

      {tab === "harian" ? <DailySheet /> : <MonthlyRecap />}
    </div>
  );
}

function DailySheet() {
  const { storeId } = useApp();
  const [date, setDate] = useState(today);
  const [edits, setEdits] = useState<Record<number, Entry>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { data, loading, error, refresh } = useFetch<DaySheet>(`/api/attendance${qs({ date, storeId })}`);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const saved = (r: DayRow): Entry => ({ status: r.status, note: r.note ?? "" });
  const entry = (r: DayRow): Entry => edits[r.employeeId] ?? saved(r);

  const changed = rows.filter((r) => {
    const e = edits[r.employeeId];
    return e && (e.status !== r.status || e.note.trim() !== (r.note ?? ""));
  });

  const counts = useMemo(() => {
    const c = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, 0])) as Record<AttendanceStatus, number>;
    let open = 0;
    for (const r of rows) {
      const s = (edits[r.employeeId] ?? { status: r.status }).status;
      if (s) c[s] += 1;
      else open += 1;
    }
    return { ...c, open };
  }, [rows, edits]);

  function goTo(next: string) {
    if (!next || next === date) return;
    if (changed.length && !window.confirm("Perubahan absensi belum disimpan. Tetap pindah tanggal?")) return;
    setDate(next);
    setEdits({});
    setMsg(null);
  }

  function edit(r: DayRow, patch: Partial<Entry>) {
    if (r.lockedBy) return;
    setEdits((prev) => ({ ...prev, [r.employeeId]: { ...(prev[r.employeeId] ?? saved(r)), ...patch } }));
  }

  function markAllPresent() {
    const next = { ...edits };
    for (const r of rows) {
      const e = next[r.employeeId] ?? saved(r);
      if (!r.lockedBy && e.status === null) next[r.employeeId] = { ...e, status: "PRESENT" };
    }
    setEdits(next);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.put("/api/attendance", {
        date,
        entries: changed.map((r) => {
          const e = entry(r);
          return { employeeId: r.employeeId, status: e.status, note: e.note.trim() || null };
        }),
      });
      setEdits({});
      setMsg({ kind: "ok", text: `Absensi ${changed.length} karyawan tersimpan.` });
      refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan absensi." });
    } finally {
      setBusy(false);
    }
  }

  const isFuture = date > today();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 px-6 pt-4">
        <div className="flex items-center">
          <button className="btn btn-secondary h-10 px-2.5" onClick={() => goTo(addDays(date, -1))} aria-label="Hari sebelumnya">
            <ChevronLeft size={16} />
          </button>
          <input type="date" className="input h-10 w-[170px]" value={date} onChange={(e) => goTo(e.target.value)} />
          <button className="btn btn-secondary h-10 px-2.5" onClick={() => goTo(addDays(date, 1))} aria-label="Hari berikutnya">
            <ChevronRight size={16} />
          </button>
        </div>
        <button className="btn btn-ghost h-10" onClick={() => goTo(today())} disabled={date === today()}>
          Hari ini
        </button>
        <div className="text-sm font-semibold">{LONG_DATE.format(parseDay(date))}</div>
        <div className="ml-auto flex flex-wrap gap-1.5 text-[11px] font-semibold">
          {ATTENDANCE_STATUSES.map((s) => (
            <span key={s} className={clsx("px-2 py-1", TONE[s].soft)}>
              {ATTENDANCE_LABEL[s]} {counts[s]}
            </span>
          ))}
          <span className="bg-white px-2 py-1 text-slate-7 ring-1 ring-divider">Belum {counts.open}</span>
        </div>
      </div>

      {isFuture && (
        <div className="mx-6 mt-3 bg-amber-100 px-4 py-2.5 text-[13px] font-semibold text-amber-700 ring-1 ring-amber-300">
          Tanggal ini belum terjadi — biasanya hanya izin atau cuti yang dicatat lebih dulu.
        </div>
      )}
      {msg && (
        <div
          role="alert"
          className={clsx(
            "mx-6 mt-3 px-4 py-3 text-sm font-semibold ring-1",
            msg.kind === "ok" ? "bg-teal-200 text-teal-700 ring-teal-400" : "bg-brand-100 text-brand-800 ring-brand-300"
          )}
        >
          {msg.text}
        </div>
      )}
      {error && <ErrorBox message={error} />}

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Tidak ada karyawan aktif pada tanggal ini."
            hint="Karyawan muncul di sini mulai tanggal masuknya, sampai tanggal keluarnya."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl min-w-[860px]">
                <thead>
                  <tr>
                    <th>Karyawan</th>
                    <th className="w-[380px]">Kehadiran</th>
                    <th className="w-[260px]">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const e = entry(r);
                    return (
                      <tr key={r.employeeId} className={clsx(r.lockedBy && "opacity-70")}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={r.name} src={r.photoUrl} size={34} />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">{r.name}</div>
                              <div className="text-[11px] text-slate-7">
                                {r.storeLabel ?? "Semua toko"} · upah {PERIOD_LABEL[r.wagePeriod].toLowerCase()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex" role="radiogroup" aria-label={`Kehadiran ${r.name}`}>
                            {ATTENDANCE_STATUSES.map((s) => (
                              <button
                                key={s}
                                type="button"
                                role="radio"
                                aria-checked={e.status === s}
                                disabled={Boolean(r.lockedBy)}
                                // Picking the chosen status again clears the day back to "not recorded".
                                onClick={() => edit(r, { status: e.status === s ? null : s })}
                                className={clsx(
                                  "h-9 flex-1 text-xs font-semibold ring-1 ring-divider transition-colors disabled:cursor-not-allowed",
                                  e.status === s ? TONE[s].on : "bg-white text-ink hover:bg-slate-2"
                                )}
                              >
                                {BUTTON_LABEL[s]}
                              </button>
                            ))}
                          </div>
                          {r.lockedBy && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-7">
                              <Lock size={11} /> Terkunci — upah {r.lockedBy} sudah dibayar
                            </div>
                          )}
                        </td>
                        <td>
                          <input
                            className="input h-9 text-[13px]"
                            placeholder={e.status === "SICK" ? "Surat dokter…" : "Opsional"}
                            maxLength={255}
                            value={e.note}
                            disabled={Boolean(r.lockedBy)}
                            onChange={(ev) => edit(r, { note: ev.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button className="btn btn-secondary" onClick={markAllPresent} disabled={counts.open === 0}>
                Tandai sisanya hadir
              </button>
              {changed.length > 0 && (
                <button className="btn btn-ghost" onClick={() => setEdits({})} disabled={busy}>
                  Batalkan perubahan
                </button>
              )}
              <button className="btn btn-primary ml-auto h-11 px-5" onClick={save} disabled={busy || changed.length === 0}>
                {busy ? "Menyimpan…" : changed.length ? `Simpan absensi (${changed.length})` : "Simpan absensi"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function MonthlyRecap() {
  const { storeId } = useApp();
  const [range, setRange] = useState(() => periodRange("MONTHLY", today()));
  const { data, loading, error } = useFetch<Recap>(`/api/attendance${qs({ from: range.start, to: range.end, storeId })}`);
  const now = today();

  function exportCsv() {
    if (!data) return;
    const header = ["Karyawan", "Toko", ...data.days.map((d) => d.slice(8)), ...ATTENDANCE_STATUSES.map((s) => ATTENDANCE_LABEL[s]), "Hari kerja"];
    const body = data.rows.map((r) => [
      r.name, r.storeLabel ?? "Semua toko",
      ...data.days.map((d) => (r.marks[d] ? ATTENDANCE_SHORT[r.marks[d]] : "")),
      ...ATTENDANCE_STATUSES.map((s) => r.counts[s]), r.workDays,
    ]);
    const blob = new Blob(["﻿" + toCsv([header, ...body])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `absensi_${range.start.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 px-6 pt-4">
        <div className="flex items-center">
          <button className="btn btn-secondary h-10 px-2.5" onClick={() => setRange(shiftPeriod("MONTHLY", range.start, -1))} aria-label="Bulan sebelumnya">
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            className="input h-10 w-[170px]"
            value={range.start.slice(0, 7)}
            onChange={(e) => e.target.value && setRange(periodRange("MONTHLY", `${e.target.value}-01`))}
          />
          <button className="btn btn-secondary h-10 px-2.5" onClick={() => setRange(shiftPeriod("MONTHLY", range.start, 1))} aria-label="Bulan berikutnya">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="text-sm font-semibold capitalize">{MONTH.format(parseDay(range.start))}</div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          {ATTENDANCE_STATUSES.map((s) => (
            <span key={s} className={clsx("px-1.5 py-1", TONE[s].soft)}>
              {ATTENDANCE_SHORT[s]} = {ATTENDANCE_LABEL[s]}
            </span>
          ))}
          <button className="btn btn-secondary ml-1 h-9" onClick={exportCsv} disabled={!data?.rows.length}>
            <Download size={14} /> Ekspor CSV
          </button>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState title="Tidak ada karyawan pada bulan ini." />
        ) : (
          <div className="table-wrap">
            <table className="tbl w-auto min-w-full">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[2] min-w-[200px] bg-bg">Karyawan</th>
                  {data.days.map((d) => {
                    const weekday = parseDay(d).getUTCDay();
                    return (
                      <th
                        key={d}
                        className={clsx(
                          "w-[30px] min-w-[30px] px-0 text-center leading-tight",
                          weekday === 0 && "text-brand-600",
                          d === now && "bg-brand-100"
                        )}
                      >
                        {Number(d.slice(8))}
                        <div className="text-[9px] font-semibold">{WEEKDAY[weekday]}</div>
                      </th>
                    );
                  })}
                  {ATTENDANCE_STATUSES.map((s) => (
                    <th key={s} className="w-[38px] px-1 text-center" title={ATTENDANCE_LABEL[s]}>
                      {ATTENDANCE_SHORT[s]}
                    </th>
                  ))}
                  {/* Pinned right, like the names on the left: the total is the point of the recap. */}
                  <th className="sticky right-0 z-[2] w-[70px] bg-bg text-right shadow-[inset_1px_0_0_var(--color-divider)]">
                    Hari kerja
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td className="sticky left-0 z-[1] bg-white">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.name} src={r.photoUrl} size={26} />
                        <span className="whitespace-nowrap text-[13px] font-semibold">{r.name}</span>
                      </div>
                    </td>
                    {data.days.map((d) => {
                      const mark = r.marks[d];
                      const employed = d >= r.joinedAt && (!r.resignAt || d <= r.resignAt);
                      return (
                        <td
                          key={d}
                          title={mark ? ATTENDANCE_LABEL[mark] : undefined}
                          className={clsx(
                            "px-0 py-1.5 text-center text-xs font-bold",
                            mark ? TONE[mark].soft : !employed && "bg-slate-2"
                          )}
                        >
                          {mark ? ATTENDANCE_SHORT[mark] : ""}
                        </td>
                      );
                    })}
                    {ATTENDANCE_STATUSES.map((s) => (
                      <td key={s} className="px-1 text-center text-[13px]">
                        {r.counts[s] || <span className="text-slate-4">0</span>}
                      </td>
                    ))}
                    <td className="sticky right-0 z-[1] bg-white text-right text-[13px] font-extrabold shadow-[inset_1px_0_0_var(--color-divider)]">
                      {num(r.workDays)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-7">
          Kotak abu-abu = belum masuk atau sudah keluar. Kotak kosong = belum dicatat. Ubah absensi di tab Input harian.
        </p>
      </div>
    </>
  );
}
