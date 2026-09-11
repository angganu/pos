import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { fdatetime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SistemPage() {
  await requireUser();

  const [stores, users, items, sales, purchases, movements, lastSale] = await Promise.all([
    prisma.store.count(), prisma.user.count(), prisma.item.count(),
    prisma.sale.count(), prisma.purchase.count(), prisma.stockMovement.count(),
    prisma.sale.findFirst({ orderBy: { date: "desc" }, select: { date: true, code: true } }),
  ]);

  const rows: [string, string][] = [
    ["Versi aplikasi", "1.0.0"],
    ["Basis data", "MySQL (Prisma ORM)"],
    ["Kerangka kerja", "Next.js App Router + Tailwind CSS"],
    ["Zona waktu", Intl.DateTimeFormat().resolvedOptions().timeZone],
    ["Jumlah toko", String(stores)],
    ["Jumlah pengguna", String(users)],
    ["Jumlah barang", String(items)],
    ["Transaksi penjualan", String(sales)],
    ["Faktur pembelian", String(purchases)],
    ["Baris kartu stok", String(movements)],
    ["Transaksi terakhir", lastSale ? `${lastSale.code} · ${fdatetime(lastSale.date)}` : "—"],
  ];

  return (
    <div>
      <PageHeader kicker="Sistem / System" title="Informasi sistem" subtitle="Ringkasan teknis instalasi ini." />
      <div className="max-w-3xl px-6 py-6">
        <div className="bg-white ring-1 ring-divider">
          {rows.map(([label, value], i) => (
            <div key={label} className={`flex items-center justify-between gap-4 px-5 py-3 ${i ? "border-t border-divider" : ""}`}>
              <span className="text-[13px] text-slate-7">{label}</span>
              <span className="text-sm font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
