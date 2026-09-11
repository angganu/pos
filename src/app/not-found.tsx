import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
      <div className="label-kicker text-brand-600">404</div>
      <h1 className="m-0 text-4xl">Halaman tidak ditemukan</h1>
      <p className="max-w-md text-sm text-slate-7">
        Alamat yang Anda buka tidak ada, atau Anda tidak punya izin untuk melihatnya.
      </p>
      <Link href="/" className="btn btn-primary h-11 px-5 no-underline">
        Kembali ke beranda
      </Link>
    </div>
  );
}
