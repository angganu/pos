"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

const DEMO = [
  { label: "Administrator", email: "admin@satupos.id" },
  { label: "Owner", email: "owner@satupos.id" },
  { label: "Manajer Toko", email: "manajer@satupos.id" },
  { label: "Kasir", email: "kasir@satupos.id" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("kasir@satupos.id");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/login", { email, password });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="hidden flex-1 flex-col justify-between bg-slate-9 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center bg-brand-600 text-lg font-extrabold">
            SP
          </div>
          <div>
            <div className="text-lg font-extrabold leading-tight">KASAKU</div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-4">Multi-Toko</div>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl leading-tight text-white">
            Satu sistem untuk semua toko Anda.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-3">
            Harga berbeda tiap toko, harga khusus untuk member, stok yang selalu
            cocok, dan laporan laba yang bisa dipercaya.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-px bg-slate-7">
            {[
              ["3", "Toko"],
              ["4", "Peran"],
              ["11%", "PPN"],
            ].map(([v, l]) => (
              <div key={l} className="bg-slate-9 px-4 py-4">
                <div className="text-2xl font-extrabold">{v}</div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-slate-4">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-5">© {new Date().getFullYear()} KASAKU</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-bg p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center bg-brand-600 text-lg font-extrabold text-white">
              SP
            </div>
          </div>

          <div className="label-kicker mb-2 text-brand-600">Masuk / Sign in</div>
          <h2 className="mb-1 text-3xl">Selamat datang</h2>
          <p className="mb-7 text-sm text-slate-7">
            Gunakan akun yang diberikan administrator.
          </p>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input h-11 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Kata sandi</label>
              <input
                id="password"
                type="password"
                className="input h-11 text-base"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div
                role="alert"
                className="bg-brand-100 px-3 py-2 text-sm font-semibold text-brand-800 ring-1 ring-brand-300"
              >
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary mt-1 h-12 justify-center text-base">
              {busy ? "Memeriksa…" : "Masuk"}
            </button>
          </form>

          <div className="mt-8">
            <div className="label-kicker mb-2">Akun demo · sandi password123</div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword("password123");
                  }}
                  className="bg-white px-3 py-2 text-left text-xs ring-1 ring-divider hover:bg-slate-2"
                >
                  <div className="font-semibold">{d.label}</div>
                  <div className="text-slate-6">{d.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
