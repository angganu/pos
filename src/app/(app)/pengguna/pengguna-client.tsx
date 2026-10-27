"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, Modal, SearchSelect, ErrorBox } from "@/components/ui";
import { api } from "@/lib/client";
import { fdatetime, initials } from "@/lib/format";

type UserRow = {
  id: number; name: string; email: string; role: string; employeeId: number;
  storeId: number | null; storeLabel: string; active: boolean; lastLoginAt: string | null;
};

/** An active employee without a login yet. */
type Candidate = { id: number; name: string; email: string | null; storeId: number | null; storeLabel: string | null };

const EMPTY_FORM = { employeeId: "", email: "", password: "", role: "CASHIER", storeId: "" };

const ROLES = ["ADMIN", "OWNER", "MANAGER", "CASHIER"] as const;
const ROLE_ID: Record<string, string> = {
  ADMIN: "Administrator", OWNER: "Owner", MANAGER: "Manajer Toko", CASHIER: "Kasir",
};

/** Mirrors src/lib/rbac.ts — kept visible so admins can see what each role can do. */
const PERMS: [string, number, number, number, number][] = [
  ["PO di kasir & buat invoice", 1, 1, 1, 1],
  ["Tutup kasir & rekap uang", 1, 1, 1, 1],
  ["Retur & refund", 1, 1, 1, 1],
  ["Pengiriman & surat jalan", 1, 1, 1, 1],
  ["Transaksi pembelian", 1, 1, 1, 0],
  ["Batalkan PO / void transaksi", 1, 1, 1, 0],
  ["Ubah harga jual", 1, 1, 2, 0],
  ["Kelola member & supplier", 1, 1, 2, 0],
  ["Transfer & opname stok", 1, 1, 2, 0],
  ["Lihat laba & laporan", 1, 1, 2, 0],
  ["Catat absensi karyawan", 1, 1, 2, 0],
  ["Kelola barang & kategori", 1, 1, 0, 0],
  ["Kelola master kendaraan", 1, 1, 0, 0],
  ["Kelola data karyawan & upah", 1, 1, 0, 0],
  ["Akses semua toko", 1, 1, 0, 0],
  ["Kelola pengguna & peran", 1, 0, 0, 0],
];
const MARK = ["✕", "✓", "Toko sendiri"];

export default function PenggunaClient() {
  const { stores } = useApp();
  const { data, loading, refresh } = useFetch<UserRow[]>("/api/users");
  const [open, setOpen] = useState(false);
  const { data: candidates } = useFetch<Candidate[]>(open ? "/api/employees?available=1" : null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const needsStore = form.role === "MANAGER" || form.role === "CASHIER";

  /** Picking the employee fills in what the login can take from them. */
  function pickEmployee(v: string) {
    const e = candidates?.find((c) => String(c.id) === v);
    setForm({
      ...form,
      employeeId: v,
      email: form.email || e?.email || "",
      storeId: e?.storeId ? String(e.storeId) : form.storeId,
    });
  }

  async function create() {
    if (!form.employeeId) {
      setError("Pilih karyawan pemilik akun ini.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/users", {
        employeeId: Number(form.employeeId), email: form.email, password: form.password, role: form.role,
        storeId: needsStore && form.storeId ? Number(form.storeId) : null,
      });
      setOpen(false);
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah pengguna.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: UserRow) {
    setListError(null);
    try {
      await api.patch("/api/users", { id: u.id, active: !u.active });
      refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Gagal mengubah status pengguna.");
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Sistem / Administrator"
        title="Pengguna & peran"
        subtitle="Satu pengguna = satu karyawan = satu peran = satu (atau semua) toko."
        actions={
          <button
            className="btn btn-primary h-11 px-4 text-[15px]"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            + Tambah pengguna
          </button>
        }
      />

      {listError && <ErrorBox message={listError} />}

      {loading ? (
        <Loading />
      ) : (
        <div className="px-6 pt-4">
          <div className="table-wrap">
            <table className="tbl min-w-[820px]">
              <thead>
                <tr>
                  <th>Pengguna</th>
                  <th className="w-[160px]">Peran</th>
                  <th className="w-[220px]">Toko</th>
                  <th className="w-[100px]">Status</th>
                  <th className="w-[170px]">Terakhir masuk</th>
                  <th className="w-[110px]" />
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center bg-slate-3 text-xs font-extrabold text-slate-8">
                          {initials(u.name)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{u.name}</div>
                          <div className="text-[11px] text-slate-7">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-[13px] font-semibold">{ROLE_ID[u.role] ?? u.role}</td>
                    <td className="text-[13px]">{u.storeLabel}</td>
                    <td>
                      <span className={u.active ? "tag tag-teal" : "tag tag-accent"}>
                        {u.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="text-[13px] text-slate-7">{fdatetime(u.lastLoginAt)}</td>
                    <td className="text-right">
                      <button className="btn btn-ghost text-xs" onClick={() => toggleActive(u)}>
                        {u.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="px-6 pb-10 pt-8">
        <h4 className="mb-1 text-base">Hak akses per peran</h4>
        <p className="mb-3 text-[13px] text-slate-7">
          “Toko sendiri” berarti hanya untuk toko tempat pengguna ditugaskan.
        </p>
        <div className="table-wrap">
          <table className="tbl min-w-[720px]">
            <thead>
              <tr>
                <th>Hak akses</th>
                {ROLES.map((r) => (
                  <th key={r} className="w-[130px] text-center">{ROLE_ID[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMS.map(([label, ...marks]) => (
                <tr key={label}>
                  <td className="text-sm">{label}</td>
                  {marks.map((m, i) => (
                    <td
                      key={i}
                      className={clsx(
                        "text-center text-[13px] font-semibold",
                        m === 0 ? "text-slate-4" : m === 2 ? "text-slate-7" : "text-ink"
                      )}
                    >
                      {MARK[m]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tambah pengguna"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Batal</button>
            <button className="btn btn-primary" onClick={create} disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan pengguna"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          {error && <div className="bg-brand-100 px-3 py-2 text-sm font-semibold text-brand-800">{error}</div>}
          <div className="field">
            <label htmlFor="emp">Karyawan</label>
            <SearchSelect
              id="emp"
              className="input h-10"
              value={form.employeeId}
              onChange={pickEmployee}
              placeholder={candidates ? "Pilih karyawan…" : "Memuat karyawan…"}
              emptyText="Semua karyawan aktif sudah punya akun."
              options={(candidates ?? []).map((c) => ({
                value: String(c.id),
                label: c.storeLabel ? `${c.name} — ${c.storeLabel}` : c.name,
              }))}
            />
            <p className="m-0 mt-1.5 text-xs text-slate-7">
              Nama pengguna mengikuti data karyawan. Karyawan belum ada? Tambahkan dulu di{" "}
              <Link href="/karyawan">Data Karyawan</Link>.
            </p>
          </div>
          <div className="field">
            <label htmlFor="e">Email login</label>
            <input id="e" type="email" className="input h-10" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p">Kata sandi sementara (min. 8 karakter)</label>
            <input id="p" type="text" className="input h-10" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="r">Peran</label>
            <SearchSelect
              id="r"
              className="input h-10"
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v })}
              options={ROLES.map((r) => ({ value: r, label: ROLE_ID[r] }))}
            />
          </div>
          {needsStore && (
            <div className="field">
              <label htmlFor="s">Ditugaskan ke toko</label>
              <SearchSelect
                id="s"
                className="input h-10"
                value={form.storeId}
                onChange={(v) => setForm({ ...form, storeId: v })}
                placeholder="Pilih toko…"
                options={stores.map((s) => ({ value: String(s.id), label: `${s.code} · ${s.name}` }))}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
