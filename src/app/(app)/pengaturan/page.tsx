import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const user = await requireUser();
  const settings = await prisma.setting.findMany({ orderBy: { key: "asc" } });
  const editable = can(user, "user.manage");

  const LABELS: Record<string, string> = {
    "company.name": "Nama perusahaan",
    "tax.rate": "Tarif PPN (%)",
    "tax.enabled": "PPN aktif secara default",
    "receipt.footer": "Teks penutup struk",
    "loyalty.rupiahPerPoint": "Rupiah per 1 poin loyalitas",
  };

  return (
    <div>
      <PageHeader
        kicker="Sistem / Settings"
        title="Pengaturan"
        subtitle={editable ? "Nilai ini dipakai di seluruh aplikasi." : "Hanya administrator yang dapat mengubah nilai ini."}
      />

      <div className="max-w-3xl px-6 py-6">
        <div className="bg-white ring-1 ring-divider">
          {settings.map((s, i) => (
            <div key={s.key} className={`flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 ${i ? "border-t border-divider" : ""}`}>
              <div>
                <div className="text-sm font-semibold">{LABELS[s.key] ?? s.key}</div>
                <div className="text-[11px] text-slate-6">{s.key}</div>
              </div>
              <input
                className="input h-10 max-w-[240px]"
                defaultValue={s.value}
                disabled={!editable}
                readOnly={!editable}
              />
            </div>
          ))}
          {settings.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-slate-6">
              Belum ada pengaturan. Jalankan <code>npm run db:seed</code> untuk mengisi nilai awal.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
