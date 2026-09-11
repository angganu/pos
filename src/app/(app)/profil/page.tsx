import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/rbac";
import { fdatetime, initials } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProfilPage() {
  const user = await requireUser();
  const [salesCount, shifts, row] = await Promise.all([
    prisma.sale.count({ where: { userId: user.id } }),
    prisma.shift.count({ where: { userId: user.id } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { lastLoginAt: true, createdAt: true } }),
  ]);

  return (
    <div>
      <PageHeader kicker="Akun / Profile" title="Profil pengguna" subtitle="Data akun Anda di sistem ini." />
      <div className="max-w-3xl px-6 py-6">
        <div className="flex items-center gap-4 bg-white p-5 ring-1 ring-divider">
          <div className="flex h-16 w-16 flex-none items-center justify-center bg-brand-600 text-xl font-extrabold text-white">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-extrabold">{user.name}</div>
            <div className="text-sm text-slate-7">{user.email}</div>
            <div className="mt-1 text-[13px]">
              <span className="tag tag-accent">{ROLE_LABEL[user.role]}</span>{" "}
              <span className="ml-1 text-slate-7">{user.storeName ?? "Semua toko"}</span>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {[
            ["Transaksi diproses", String(salesCount)],
            ["Shift dijalankan", String(shifts)],
            ["Terakhir masuk", fdatetime(row?.lastLoginAt)],
            ["Akun dibuat", fdatetime(row?.createdAt)],
          ].map(([label, value]) => (
            <div key={label} className="bg-white p-4 ring-1 ring-divider">
              <dt className="label-kicker mb-2">{label}</dt>
              <dd className="m-0 text-xl font-extrabold">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-[13px] text-slate-7">
          Untuk mengganti kata sandi atau toko yang ditugaskan, hubungi administrator.
        </p>
      </div>
    </div>
  );
}
