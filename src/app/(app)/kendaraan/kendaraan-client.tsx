"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, EmptyState, ErrorBox, Toolbar, Chip, Modal } from "@/components/ui";
import { api } from "@/lib/client";
import { fdate, num } from "@/lib/format";

type Row = {
  id: number; vehicleNo: string; vehicleType: string;
  driver: string | null; driverAssistance: string | null;
  minCapacity: number | null; maxCapacity: number | null;
  dueTax: string | null; dueStnk: string | null; dueKir: string | null;
  active: boolean;
};

type Form = {
  vehicleNo: string; vehicleType: string; driver: string; driverAssistance: string;
  minCapacity: string; maxCapacity: string; dueTax: string; dueStnk: string; dueKir: string;
  active: boolean;
};

const EMPTY: Form = {
  vehicleNo: "", vehicleType: "", driver: "", driverAssistance: "",
  minCapacity: "", maxCapacity: "", dueTax: "", dueStnk: "", dueKir: "", active: true,
};

/** A due date this many days away or fewer is flagged amber. */
const SOON_DAYS = 30;

type Status = "all" | "active" | "inactive";
const STATUS_LABEL: Record<Status, string> = { all: "Semua", active: "Aktif", inactive: "Nonaktif" };

function toForm(v: Row): Form {
  return {
    vehicleNo: v.vehicleNo, vehicleType: v.vehicleType,
    driver: v.driver ?? "", driverAssistance: v.driverAssistance ?? "",
    minCapacity: v.minCapacity?.toString() ?? "", maxCapacity: v.maxCapacity?.toString() ?? "",
    dueTax: v.dueTax?.slice(0, 10) ?? "", dueStnk: v.dueStnk?.slice(0, 10) ?? "", dueKir: v.dueKir?.slice(0, 10) ?? "",
    active: v.active,
  };
}

function toPayload(f: Form) {
  const text = (s: string) => s.trim() || null;
  const amount = (s: string) => (s.trim() === "" ? null : Number(s));
  return {
    vehicleNo: f.vehicleNo, vehicleType: f.vehicleType,
    driver: text(f.driver), driverAssistance: text(f.driverAssistance),
    minCapacity: amount(f.minCapacity), maxCapacity: amount(f.maxCapacity),
    dueTax: f.dueTax || null, dueStnk: f.dueStnk || null, dueKir: f.dueKir || null,
    active: f.active,
  };
}

function capacity(v: Row): string {
  const { minCapacity: min, maxCapacity: max } = v;
  if (min != null && max != null) return `${num(min)} – ${num(max)} kg`;
  if (max != null) return `≤ ${num(max)} kg`;
  if (min != null) return `≥ ${num(min)} kg`;
  return "—";
}

/** Due date, flagged red once it has passed and amber when it is close. */
function Due({ date, watch }: { date: string | null; watch: boolean }) {
  if (!date) return <span className="text-slate-5">—</span>;
  // Parse the date part alone so the browser's time zone cannot shift the day.
  const due = parseISO(date.slice(0, 10));
  const days = differenceInCalendarDays(due, new Date());
  if (!watch || days > SOON_DAYS) return <span className="text-[13px]">{fdate(due)}</span>;
  return (
    <div>
      <span className={days < 0 ? "tag tag-accent" : "tag tag-amber"}>{fdate(due)}</span>
      <div className="mt-0.5 text-[11px] text-slate-7">
        {days < 0 ? `lewat ${-days} hari` : days === 0 ? "hari ini" : `${days} hari lagi`}
      </div>
    </div>
  );
}

export default function KendaraanClient() {
  const { data, loading, error, refresh } = useFetch<Row[]>("/api/vehicles");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (v) =>
        (status === "all" || v.active === (status === "active")) &&
        (!needle ||
          [v.vehicleNo, v.vehicleType, v.driver, v.driverAssistance].some((s) => s?.toLowerCase().includes(needle)))
    );
  }, [data, q, status]);

  const bind = (k: Exclude<keyof Form, "active">) => ({
    id: k,
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  function openForm(v: Row | null) {
    setEditing(v ?? "new");
    setForm(v ? toForm(v) : EMPTY);
    setActionError(null);
  }

  function openRemove(v: Row) {
    setRemoving(v);
    setActionError(null);
  }

  async function save() {
    setBusy(true);
    setActionError(null);
    try {
      const body = toPayload(form);
      if (editing === "new") await api.post("/api/vehicles", body);
      else if (editing) await api.patch("/api/vehicles", { id: editing.id, ...body });
      setEditing(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menyimpan kendaraan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.del(`/api/vehicles?id=${removing.id}`);
      setRemoving(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menghapus kendaraan.");
    } finally {
      setBusy(false);
    }
  }

  const errorNote = actionError && (
    <div className="bg-brand-100 px-3 py-2 text-sm font-semibold text-brand-800">{actionError}</div>
  );

  return (
    <div>
      <PageHeader
        kicker="Data induk / Master data"
        title="Master kendaraan"
        subtitle={`Jatuh tempo merah = sudah lewat, kuning = ${SOON_DAYS} hari lagi atau kurang.`}
        actions={
          <button className="btn btn-primary h-11 px-4 text-[15px]" onClick={() => openForm(null)}>
            + Tambah kendaraan
          </button>
        }
      />

      <Toolbar>
        <input
          className="input h-11 max-w-[340px] text-[15px]"
          placeholder="Cari no. polisi, jenis, sopir…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            {STATUS_LABEL[s]}
          </Chip>
        ))}
      </Toolbar>

      {error && <ErrorBox message={error} />}

      <div className="px-6 pb-10 pt-4">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState title={data?.length ? "Tidak ada kendaraan yang cocok." : "Belum ada kendaraan."} />
        ) : (
          <div className="table-wrap">
            <table className="tbl min-w-[1040px]">
              <thead>
                <tr>
                  <th>Kendaraan</th>
                  <th className="w-[200px]">Sopir / kenek</th>
                  <th className="w-[160px] text-right">Kapasitas</th>
                  <th className="w-[120px]">Pajak</th>
                  <th className="w-[120px]">STNK</th>
                  <th className="w-[120px]">KIR</th>
                  <th className="w-[100px]">Status</th>
                  <th className="w-[140px]" />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="text-sm font-semibold">{v.vehicleNo}</div>
                      <div className="text-[11px] text-slate-7">{v.vehicleType}</div>
                    </td>
                    <td>
                      <div className="text-[13px]">{v.driver ?? "—"}</div>
                      <div className="text-[11px] text-slate-7">Kenek: {v.driverAssistance ?? "—"}</div>
                    </td>
                    <td className="text-right text-[13px]">{capacity(v)}</td>
                    <td><Due date={v.dueTax} watch={v.active} /></td>
                    <td><Due date={v.dueStnk} watch={v.active} /></td>
                    <td><Due date={v.dueKir} watch={v.active} /></td>
                    <td>
                      <span className={v.active ? "tag tag-teal" : "tag tag-neutral"}>
                        {v.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn btn-ghost text-xs" onClick={() => openForm(v)}>Ubah</button>
                      <button className="btn btn-ghost text-xs text-brand-700" onClick={() => openRemove(v)}>Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Tambah kendaraan" : "Ubah kendaraan"}
        width="720px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Batal</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan kendaraan"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          {errorNote}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="vehicleNo">No. polisi</label>
              <input className="input h-10 uppercase" placeholder="B 1234 XYZ" {...bind("vehicleNo")} />
            </div>
            <div className="field">
              <label htmlFor="vehicleType">Jenis kendaraan</label>
              <input className="input h-10" placeholder="Truk engkel, pikap, CDD…" {...bind("vehicleType")} />
            </div>
            <div className="field">
              <label htmlFor="driver">Sopir</label>
              <input className="input h-10" {...bind("driver")} />
            </div>
            <div className="field">
              <label htmlFor="driverAssistance">Kenek / asisten sopir</label>
              <input className="input h-10" {...bind("driverAssistance")} />
            </div>
            <div className="field">
              <label htmlFor="minCapacity">Kapasitas minimum (kg)</label>
              <input type="number" min={0} step="any" className="input h-10 text-right" {...bind("minCapacity")} />
            </div>
            <div className="field">
              <label htmlFor="maxCapacity">Kapasitas maksimum (kg)</label>
              <input type="number" min={0} step="any" className="input h-10 text-right" {...bind("maxCapacity")} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div className="field">
              <label htmlFor="dueTax">Jatuh tempo pajak</label>
              <input type="date" className="input h-10" {...bind("dueTax")} />
            </div>
            <div className="field">
              <label htmlFor="dueStnk">Jatuh tempo STNK</label>
              <input type="date" className="input h-10" {...bind("dueStnk")} />
            </div>
            <div className="field">
              <label htmlFor="dueKir">Jatuh tempo KIR</label>
              <input type="date" className="input h-10" {...bind("dueKir")} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-brand-600"
            />
            Aktif — kendaraan nonaktif tetap tersimpan tapi tidak dipantau jatuh temponya
          </label>
        </div>
      </Modal>

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Hapus kendaraan"
        width="460px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRemoving(null)}>Batal</button>
            <button className="btn btn-danger" onClick={remove} disabled={busy}>
              {busy ? "Menghapus…" : "Hapus permanen"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          {errorNote}
          <p className="m-0 text-sm">
            Hapus <b>{removing?.vehicleNo}</b> secara permanen? Untuk berhenti memakainya tapi tetap menyimpan
            datanya, ubah statusnya menjadi nonaktif.
          </p>
        </div>
      </Modal>
    </div>
  );
}
