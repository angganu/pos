"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { differenceInYears, format, parseISO } from "date-fns";
import type { EmployeeStatus, Gender, Role, WagePeriod } from "@prisma/client";
import { Camera } from "lucide-react";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import {
  PageHeader, Loading, EmptyState, ErrorBox, Toolbar, Chip, Modal, SearchSelect, Segmented, Avatar,
} from "@/components/ui";
import { api } from "@/lib/client";
import { fday, rp } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/rbac";
import { PERIOD_LABEL } from "@/lib/wages";

type Row = {
  id: number; name: string; gender: Gender | null; birthDate: string | null;
  phone: string | null; email: string | null; joinedAt: string; resignAt: string | null;
  status: EmployeeStatus; storeId: number | null; storeLabel: string | null;
  wagePeriod: WagePeriod; dailyWage: number; photoUrl: string | null;
  user: { id: number; email: string; role: Role; active: boolean } | null;
};

type Form = {
  name: string; gender: Gender | ""; birthDate: string; phone: string; email: string;
  joinedAt: string; resignAt: string; active: boolean; storeId: string;
  wagePeriod: WagePeriod; dailyWage: string;
};

const GENDER_LABEL: Record<Gender, string> = { MALE: "Laki-laki", FEMALE: "Perempuan" };
const PERIODS: WagePeriod[] = ["DAILY", "WEEKLY", "MONTHLY"];

type Status = "all" | "active" | "inactive";
const STATUS_LABEL: Record<Status, string> = { all: "Semua", active: "Aktif", inactive: "Nonaktif" };

function emptyForm(storeId: number | null): Form {
  return {
    name: "", gender: "", birthDate: "", phone: "", email: "",
    joinedAt: format(new Date(), "yyyy-MM-dd"), resignAt: "", active: true,
    storeId: storeId ? String(storeId) : "", wagePeriod: "WEEKLY", dailyWage: "",
  };
}

function toForm(e: Row): Form {
  return {
    name: e.name, gender: e.gender ?? "", birthDate: e.birthDate?.slice(0, 10) ?? "",
    phone: e.phone ?? "", email: e.email ?? "",
    joinedAt: e.joinedAt.slice(0, 10), resignAt: e.resignAt?.slice(0, 10) ?? "", active: e.status === "ACTIVE",
    storeId: e.storeId ? String(e.storeId) : "", wagePeriod: e.wagePeriod, dailyWage: String(e.dailyWage),
  };
}

/** The first thing missing from a form, in the order the fields appear. */
function missing(f: Form): string | null {
  if (!f.name.trim()) return "Nama karyawan wajib diisi.";
  if (!f.gender) return "Pilih jenis kelamin.";
  if (!f.joinedAt) return "Tanggal masuk wajib diisi.";
  if (f.dailyWage.trim() === "" || Number(f.dailyWage) < 0) return "Isi upah harian (0 bila tidak digaji).";
  return null;
}

function toPayload(f: Form) {
  const text = (s: string) => s.trim() || null;
  return {
    name: f.name, gender: f.gender || undefined, birthDate: f.birthDate || null,
    phone: text(f.phone), email: text(f.email),
    joinedAt: f.joinedAt, resignAt: f.resignAt || null, status: f.active ? "ACTIVE" : "INACTIVE",
    storeId: f.storeId ? Number(f.storeId) : null,
    wagePeriod: f.wagePeriod, dailyWage: Number(f.dailyWage),
  };
}

/** Center-crops a picked image to a square JPEG of at most `size` px, as a data URL. */
async function shrinkPhoto(file: File, size = 400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak tersedia.");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function age(birthDate: string | null): string | null {
  return birthDate ? `${differenceInYears(new Date(), parseISO(birthDate.slice(0, 10)))} th` : null;
}

export default function KaryawanClient() {
  const { stores, storeId: currentStore } = useApp();
  const { data, loading, error, refresh } = useFetch<Row[]>("/api/employees");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [period, setPeriod] = useState<WagePeriod | "all">("all");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm(null));
  /** undefined keeps the saved photo, null removes it, a data URL replaces it. */
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (e) =>
        (status === "all" || (e.status === "ACTIVE") === (status === "active")) &&
        (period === "all" || e.wagePeriod === period) &&
        (!needle || [e.name, e.phone, e.email, e.storeLabel, e.user?.email].some((s) => s?.toLowerCase().includes(needle)))
    );
  }, [data, q, status, period]);

  const current = editing && editing !== "new" ? editing : null;
  const preview = photo === undefined ? current?.photoUrl ?? null : photo;

  const bind = (k: "name" | "birthDate" | "phone" | "email" | "joinedAt" | "resignAt" | "dailyWage") => ({
    id: k,
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  function openForm(e: Row | null) {
    setEditing(e ?? "new");
    setForm(e ? toForm(e) : emptyForm(currentStore));
    setPhoto(undefined);
    setActionError(null);
  }

  function openRemove(e: Row) {
    setRemoving(e);
    setActionError(null);
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await shrinkPhoto(file));
    } catch {
      setActionError("Gambar tidak bisa dibaca. Coba file JPG atau PNG lain.");
    }
  }

  async function save() {
    const problem = missing(form);
    if (problem) {
      setActionError(problem);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const body = { ...toPayload(form), ...(photo !== undefined ? { photo } : {}) };
      if (editing === "new") await api.post("/api/employees", body);
      else if (editing) await api.patch("/api/employees", { id: editing.id, ...body });
      setEditing(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menyimpan karyawan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.del(`/api/employees?id=${removing.id}`);
      setRemoving(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menghapus karyawan.");
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
        kicker="Karyawan / HR"
        title="Data karyawan"
        subtitle="Setiap akun pengguna milik satu karyawan; karyawan tidak wajib punya akun."
        actions={
          <button className="btn btn-primary h-11 px-4 text-[15px]" onClick={() => openForm(null)}>
            + Tambah karyawan
          </button>
        }
      />

      <Toolbar>
        <input
          className="input h-11 max-w-[340px] text-[15px]"
          placeholder="Cari nama, telepon, email, toko…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            {STATUS_LABEL[s]}
          </Chip>
        ))}
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
          <EmptyState title={data?.length ? "Tidak ada karyawan yang cocok." : "Belum ada karyawan."} />
        ) : (
          <div className="table-wrap">
            <table className="tbl min-w-[1160px]">
              <thead>
                <tr>
                  <th className="min-w-[220px]">Karyawan</th>
                  <th className="w-[160px]">Kontak</th>
                  <th className="w-[150px]">Toko</th>
                  <th className="w-[120px]">Masa kerja</th>
                  <th className="w-[130px] text-right">Upah harian</th>
                  <th className="w-[180px]">Akun pengguna</th>
                  <th className="w-[80px]">Status</th>
                  <th className="w-[120px]" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={e.name} src={e.photoUrl} size={38} />
                        <div className="min-w-0">
                          <div className="whitespace-nowrap text-sm font-semibold">{e.name}</div>
                          <div className="whitespace-nowrap text-[11px] text-slate-7">
                            {[e.gender && GENDER_LABEL[e.gender], age(e.birthDate)].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="text-[13px]">{e.phone ?? "—"}</div>
                      <div className="truncate text-[11px] text-slate-7">{e.email ?? ""}</div>
                    </td>
                    <td className="text-[13px]">{e.storeLabel ?? "Semua toko"}</td>
                    <td>
                      <div className="text-[13px]">{fday(e.joinedAt)}</div>
                      {e.resignAt && <div className="text-[11px] font-semibold text-brand-700">Keluar {fday(e.resignAt)}</div>}
                    </td>
                    <td className="text-right">
                      <div className="text-[13px] font-semibold">{rp(e.dailyWage)}</div>
                      <div className="text-[11px] text-slate-7">dibayar {PERIOD_LABEL[e.wagePeriod].toLowerCase()}</div>
                    </td>
                    <td>
                      {e.user ? (
                        <>
                          <div className="truncate text-[13px]">{e.user.email}</div>
                          <div className="text-[11px] text-slate-7">
                            {ROLE_LABEL[e.user.role]}
                            {!e.user.active && <span className="ml-1.5 font-semibold text-brand-700">· nonaktif</span>}
                          </div>
                        </>
                      ) : (
                        <span className="text-[13px] text-slate-5">—</span>
                      )}
                    </td>
                    <td>
                      <span className={e.status === "ACTIVE" ? "tag tag-teal" : "tag tag-neutral"}>
                        {e.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn btn-ghost text-xs" onClick={() => openForm(e)}>Ubah</button>
                      <button className="btn btn-ghost text-xs text-brand-700" onClick={() => openRemove(e)}>Hapus</button>
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
        title={editing === "new" ? "Tambah karyawan" : "Ubah karyawan"}
        width="760px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Batal</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan karyawan"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          {errorNote}

          <div className="flex flex-col gap-3.5 sm:flex-row">
            <div className="flex flex-none flex-col items-center gap-2">
              <Avatar name={form.name || "?"} src={preview} size={112} />
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickPhoto} />
              <div className="flex gap-1">
                <button type="button" className="btn btn-secondary px-2.5 py-1.5 text-xs" onClick={() => fileRef.current?.click()}>
                  <Camera size={13} /> {preview ? "Ganti" : "Pilih foto"}
                </button>
                {preview && (
                  <button type="button" className="btn btn-ghost px-2 py-1.5 text-xs text-brand-700" onClick={() => setPhoto(null)}>
                    Hapus
                  </button>
                )}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
              <div className="field">
                <label htmlFor="name">Nama lengkap</label>
                <input className="input h-10" {...bind("name")} />
              </div>
              <div className="field">
                <label>Jenis kelamin</label>
                <Segmented
                  value={form.gender}
                  onChange={(gender) => setForm({ ...form, gender })}
                  options={[["MALE", GENDER_LABEL.MALE], ["FEMALE", GENDER_LABEL.FEMALE]]}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="birthDate">Tanggal lahir</label>
              <input type="date" className="input h-10" {...bind("birthDate")} />
            </div>
            <div className="field">
              <label htmlFor="phone">Telepon</label>
              <input type="tel" className="input h-10" placeholder="08xx xxxx xxxx" {...bind("phone")} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input type="email" className="input h-10" {...bind("email")} />
            </div>
            <div className="field">
              <label htmlFor="storeId">Toko</label>
              <SearchSelect
                id="storeId"
                className="input h-10"
                value={form.storeId}
                onChange={(v) => setForm({ ...form, storeId: v })}
                placeholder="Semua toko"
                options={[
                  { value: "", label: "Semua toko" },
                  ...stores.map((s) => ({ value: String(s.id), label: `${s.code} · ${s.name}` })),
                ]}
              />
            </div>
            <div className="field">
              <label htmlFor="joinedAt">Tanggal masuk</label>
              <input type="date" className="input h-10" {...bind("joinedAt")} />
            </div>
            <div className="field">
              <label htmlFor="resignAt">Tanggal keluar</label>
              <input type="date" className="input h-10" {...bind("resignAt")} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="field">
              <label>Periode upah</label>
              <Segmented
                value={form.wagePeriod}
                onChange={(wagePeriod) => setForm({ ...form, wagePeriod })}
                options={PERIODS.map((p) => [p, PERIOD_LABEL[p]])}
              />
            </div>
            <div className="field">
              <label htmlFor="dailyWage">Upah harian (Rp)</label>
              <input type="number" min={0} step={1000} className="input h-10 text-right" {...bind("dailyWage")} />
            </div>
          </div>
          <p className="m-0 text-xs text-slate-7">
            Upah = hari kerja dari absensi × upah harian (setengah hari dihitung ½), dihitung dan dibayar per periode
            di menu Upah Karyawan. Mengubah upah harian tidak mengubah upah yang sudah dihitung.
          </p>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-brand-600"
            />
            Aktif — karyawan nonaktif tidak muncul lagi di absensi dan upah periode baru
          </label>
          {form.resignAt && form.active && (
            <p className="m-0 -mt-2 text-xs text-amber-700">Karyawan yang sudah keluar biasanya dinonaktifkan.</p>
          )}

          {current && (
            <div className="bg-slate-1 px-3 py-2.5 text-[13px] ring-1 ring-divider">
              {current.user ? (
                <>
                  Akun pengguna: <b>{current.user.email}</b> ({ROLE_LABEL[current.user.role]}). Namanya ikut berubah
                  bila nama karyawan diubah, dan akunnya ikut nonaktif bila karyawan dinonaktifkan.
                </>
              ) : (
                <>
                  Belum punya akun pengguna. Akun dibuat di <Link href="/pengguna">Pengguna & Peran</Link>.
                </>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Hapus karyawan"
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
            Hapus <b>{removing?.name}</b> secara permanen? Hanya bisa untuk karyawan tanpa akun, absensi dan upah. Untuk
            karyawan yang keluar, isi tanggal keluar dan ubah statusnya menjadi nonaktif.
          </p>
        </div>
      </Modal>
    </div>
  );
}
