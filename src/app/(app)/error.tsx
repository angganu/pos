"use client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="label-kicker text-brand-600">Terjadi kesalahan</div>
      <h1 className="m-0 text-3xl">Halaman gagal dimuat</h1>
      <p className="max-w-md text-sm text-slate-7">{error.message || "Kesalahan tak terduga."}</p>
      <button className="btn btn-primary h-11 px-5" onClick={reset}>
        Coba lagi
      </button>
    </div>
  );
}
