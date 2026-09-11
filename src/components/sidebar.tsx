"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  ShoppingCart, Truck, RotateCcw, Package, Tags, Users, Building2, Boxes,
  ArrowLeftRight, BarChart3, GitCompareArrows, FileText, ShieldCheck,
  ChevronUp, Settings, Monitor, User, LogOut,
} from "lucide-react";
import { useApp } from "./app-context";
import { can, type Permission } from "@/lib/rbac";
import { initials } from "@/lib/format";
import { api } from "@/lib/client";

type NavItem = { href: string; id: string; label: string; en: string; icon: React.ElementType; perm: Permission };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "Transaksi / Sales",
    items: [
      { href: "/kasir", id: "kasir", label: "Kasir", en: "Sell", icon: ShoppingCart, perm: "sale.create" },
      { href: "/pembelian", id: "beli", label: "Pembelian", en: "Buy", icon: Truck, perm: "purchase.manage" },
      { href: "/retur", id: "retur", label: "Retur", en: "Returns", icon: RotateCcw, perm: "return.manage" },
    ],
  },
  {
    title: "Data Induk / Master",
    items: [
      { href: "/barang", id: "barang", label: "Barang", en: "Items", icon: Package, perm: "item.manage" },
      { href: "/harga", id: "harga", label: "Matriks Harga", en: "Prices", icon: Tags, perm: "price.manage" },
      { href: "/pelanggan", id: "pelanggan", label: "Pelanggan", en: "Members", icon: Users, perm: "partner.manage" },
      { href: "/supplier", id: "supplier", label: "Supplier", en: "Vendors", icon: Building2, perm: "store.all" },
    ],
  },
  {
    title: "Persediaan / Stock",
    items: [
      { href: "/stok", id: "stok", label: "Stok Toko", en: "Stock", icon: Boxes, perm: "stock.view" },
      { href: "/opname", id: "opname", label: "Transfer & Opname", en: "Count", icon: ArrowLeftRight, perm: "transfer.manage" },
    ],
  },
  {
    title: "Laporan / Reports",
    items: [
      { href: "/laba", id: "laba", label: "Dasbor Laba", en: "Profit", icon: BarChart3, perm: "store.all" },
      { href: "/banding", id: "banding", label: "Banding Supplier", en: "Compare", icon: GitCompareArrows, perm: "supplier.compare" },
      { href: "/laporan", id: "laporan", label: "Laporan & Ekspor", en: "Reports", icon: FileText, perm: "report.view" },
    ],
  },
  {
    title: "Sistem / System",
    items: [
      { href: "/pengguna", id: "pengguna", label: "Pengguna & Peran", en: "Roles", icon: ShieldCheck, perm: "user.manage" },
    ],
  },
];

export default function Sidebar() {
  const { user, navOpen } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const visible = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => can(user, i.perm)),
  })).filter((g) => g.items.length > 0);

  async function logout() {
    await api.post("/api/auth/logout", {});
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={clsx(
        "flex h-full flex-none flex-col overflow-hidden bg-slate-9 text-slate-1 transition-[width] duration-300 ease-out",
        navOpen ? "w-[244px]" : "w-[62px]"
      )}
    >
      {/* Brand */}
      <div className="flex flex-none items-center gap-2.5 border-b border-white/15 px-3.5 py-4">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center bg-brand-600 text-[15px] font-extrabold">
          SP
        </div>
        <div className={clsx("min-w-0 flex-1 transition-opacity duration-200", navOpen ? "opacity-100" : "opacity-0")}>
          <div className="whitespace-nowrap text-base font-extrabold leading-tight">KASAKU</div>
          <div className="whitespace-nowrap text-[11px] uppercase tracking-[0.06em] text-slate-4">
            Multi-Toko
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden pb-3">
        {visible.map((group) => (
          <div key={group.title} className="contents">
            <div
              className={clsx(
                "whitespace-nowrap px-3.5 pb-1.5 pt-4 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-4 transition-opacity duration-200",
                navOpen ? "opacity-100" : "opacity-0"
              )}
            >
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={navOpen ? undefined : `${item.label} / ${item.en}`}
                  className={clsx(
                    "group relative flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold no-underline transition-colors",
                    active ? "bg-brand-600 text-white" : "text-slate-3 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon size={17} className="flex-none" strokeWidth={2} />
                  <span
                    className={clsx(
                      "whitespace-nowrap transition-opacity duration-200",
                      navOpen ? "opacity-100" : "opacity-0"
                    )}
                  >
                    {item.label} <span className="font-normal opacity-60">/ {item.en}</span>
                  </span>

                  {/* Tooltip when collapsed */}
                  {!navOpen && (
                    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap bg-slate-9 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {item.label} / {item.en}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User + account menu */}
      <div className="relative flex-none">
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
            <div className="absolute bottom-full left-2 z-50 mb-2 w-[268px] max-w-[calc(100vw-20px)] bg-slate-9 shadow-2xl ring-1 ring-white/15">
              <div className="flex items-center gap-2.5 border-b border-white/15 px-4 py-3.5">
                <div className="flex h-9 w-9 flex-none items-center justify-center bg-brand-600 text-xs font-extrabold text-white">
                  {initials(user.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{user.name}</div>
                  <div className="text-[11px] text-slate-4">{user.email}</div>
                </div>
              </div>

              <Link href="/pengaturan" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[13.5px] font-semibold text-slate-1 no-underline hover:bg-white/10">
                <Settings size={17} className="flex-none" />
                <span className="flex-1">Pengaturan <span className="font-normal text-slate-4">/ Settings</span></span>
              </Link>
              <Link href="/sistem" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[13.5px] font-semibold text-slate-1 no-underline hover:bg-white/10">
                <Monitor size={17} className="flex-none" />
                <span className="flex-1">Informasi Sistem <span className="font-normal text-slate-4">/ System</span></span>
                <span className="text-[11px] text-slate-4">v1.0.0</span>
              </Link>
              <Link href="/profil" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[13.5px] font-semibold text-slate-1 no-underline hover:bg-white/10">
                <User size={17} className="flex-none" />
                <span className="flex-1">Profil Pengguna <span className="font-normal text-slate-4">/ Profile</span></span>
              </Link>

              <div className="h-px bg-white/15" />

              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[13.5px] font-bold text-brand-300 hover:bg-brand-600/30"
              >
                <LogOut size={17} className="flex-none" />
                <span className="flex-1">Keluar <span className="font-normal text-slate-4">/ Logout</span></span>
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title={navOpen ? undefined : `${user.name} — menu`}
          className={clsx(
            "flex w-full items-center gap-2.5 border-t border-white/15 px-3.5 py-3 text-left transition-colors",
            menuOpen ? "bg-white/15" : "hover:bg-white/10"
          )}
        >
          <div className="flex h-8 w-8 flex-none items-center justify-center bg-white/20 text-[13px] font-extrabold">
            {initials(user.name)}
          </div>
          <div className={clsx("min-w-0 flex-1 transition-opacity duration-200", navOpen ? "opacity-100" : "opacity-0")}>
            <div className="truncate text-[13px] font-semibold">{user.name}</div>
            <div className="whitespace-nowrap text-[11px] text-slate-4">{user.role}</div>
          </div>
          <ChevronUp size={15} className={clsx("flex-none transition-opacity", navOpen ? "opacity-100" : "opacity-0")} />
        </button>
      </div>
    </aside>
  );
}
