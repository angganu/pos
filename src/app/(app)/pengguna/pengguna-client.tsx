"use client";

import { useState } from "react";
import clsx from "clsx";
import { useApp } from "@/components/app-context";
import useFetch from "@/components/use-fetch";
import { PageHeader, Loading, Modal } from "@/components/ui";
import { api } from "@/lib/client";
import { fdatetime, initials } from "@/lib/format";

type UserRow = {
  id: number; name: string; email: string; role: string;
  storeId: number | null; storeLabel: string; active: boolean; lastLoginAt: string | null;
};

const ROLES = ["ADMIN", "OWNER", "MANAGER", "CASHIER"] as const;
const ROLE_ID: Record<string, string> = {
  ADMIN: "Administrator", OWNER: "Owner", MANAGER: "Manajer Toko", CASHIER: "Kasir",
};

/** Mirrors src/lib/rbac.ts — kept visible so admins can see what each role can do. */
const PERMS: [string, number, number, number, number][] = [
  ["Transaksi penjualan (kasir)", 1, 1, 1, 1],
  ["Tutup kasir & rekap uang", 1, 1, 1, 1],
  ["Retur & refund", 1, 1, 1, 1],
  ["Transaksi pembelian", 1, 1, 1, 0],
  ["Void / batal transaksi", 1, 1, 1, 0],
  ["Ubah harga jual", 1, 1, 2, 0],
  ["Kelola member & supplier", 1, 1, 2, 0],
  ["Transfer & opname stok", 1, 1, 2, 0],
  ["Lihat laba & laporan", 1, 1, 2, 0],
  ["Kelola barang & kategori", 1, 1, 0, 0],
  ["Akses semua toko", 1, 1, 0, 0],
  ["Kelola pengguna & peran", 1, 0, 0, 0],
];
const MARK = ["✕", "✓", "Toko sendiri"];

export default function PenggunaClient() {
  const { stores } = useApp();
  const { data, loading, refresh } = useFetch<UserRow[]>("/api/users");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CASHIER", storeId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsStore = form.role === "MANAGER" || form.role === "CASHIER";

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/users", {
        name: form.name, email: form.email, password: form.password, role: form.role,
        storeId: needsStore && form.storeId ? Number(form.storeId) : null,
      });
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "CASHIER", storeId: "" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah pengguna.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: UserRow) {
    await api.patch("/api/users", { id: u.id, active: !u.active });
    refresh();
  }

  return (
    <div>
      <PageHeader
        kicker="Sistem / Administrator"
        title="Pengguna & peran"
        subtitle="Satu pengguna = satu peran = satu (atau semua) toko."
        actions={
          <button className="btn btn-primary h-11 px-4 text-[15px]" onClick={() => setOpen(true)}>
            + Tambah pengguna
          </button>
        }
      />

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
            <label htmlFor="n">Nama lengkap</label>
            <input id="n" className="input h-10" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="e">Email</label>
            <input id="e" type="email" className="input h-10" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p">Kata sandi sementara (min. 8 karakter)</label>
            <input id="p" type="text" className="input h-10" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="r">Peran</label>
            <select id="r" className="input h-10" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_ID[r]}</option>)}
            </select>
          </div>
          {needsStore && (
            <div className="field">
              <label htmlFor="s">Ditugaskan ke toko</label>
              <select id="s" className="input h-10" value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })}>
                <option value="">Pilih toko…</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
