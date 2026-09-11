"use client";

import { Menu, Wifi } from "lucide-react";
import { useApp } from "./app-context";
import { SearchSelect } from "./ui";
import { ROLE_LABEL } from "@/lib/rbac";

export default function Topbar() {
  const { user, stores, storeId, setStoreId, canPickAllStores, toggleNav } = useApp();

  return (
    <header className="z-20 flex flex-none flex-wrap items-center gap-x-2.5 gap-y-2 border-b-2 border-divider bg-bg px-3.5 py-1.5">
      <button
        type="button"
        onClick={toggleNav}
        title="Tampilkan / sembunyikan menu"
        aria-label="Tampilkan atau sembunyikan menu"
        className="flex h-[34px] w-[34px] flex-none items-center justify-center bg-slate-9 text-white transition-colors hover:bg-slate-8"
      >
        <Menu size={19} />
      </button>

      <div className="flex min-w-0 flex-[1_1_220px] items-center gap-2">
        <span className="label-kicker whitespace-nowrap">Toko</span>
        <SearchSelect
          className="input h-[34px] w-auto min-w-0 max-w-[230px] flex-1 font-semibold"
          value={storeId === null ? "all" : String(storeId)}
          onChange={(v) => setStoreId(v === "all" ? null : Number(v))}
          disabled={!canPickAllStores}
          ariaLabel="Pilih toko"
          options={[
            ...(canPickAllStores ? [{ value: "all", label: "Semua toko" }] : []),
            ...stores.map((s) => ({ value: String(s.id), label: `${s.code} · ${s.name}` })),
          ]}
        />
      </div>

      <div className="ml-auto flex min-w-0 flex-none items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-7">
          <Wifi size={14} className="text-teal-600" />
          <span className="whitespace-nowrap">Daring</span>
        </div>
        <div className="whitespace-nowrap border-l border-divider pl-2.5 text-xs text-slate-7">
          {ROLE_LABEL[user.role]}
        </div>
      </div>
    </header>
  );
}
