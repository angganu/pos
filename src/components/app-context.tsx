"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";

export type Store = { id: number; code: string; name: string; address?: string | null; phone?: string | null };

type Ctx = {
  user: SessionUser;
  stores: Store[];
  storeId: number | null;
  store: Store | null;
  setStoreId: (id: number | null) => void;
  canPickAllStores: boolean;
  navOpen: boolean;
  toggleNav: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({
  user,
  stores,
  canPickAllStores,
  children,
}: {
  user: SessionUser;
  stores: Store[];
  canPickAllStores: boolean;
  children: React.ReactNode;
}) {
  // Managers/cashiers are pinned to their own store; owners/admins may pick.
  const initial = user.storeId ?? stores[0]?.id ?? null;
  const [storeId, setStoreIdState] = useState<number | null>(initial);
  const [navOpen, setNavOpen] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem("pos.storeId");
    if (saved && canPickAllStores) setStoreIdState(saved === "all" ? null : Number(saved));
    const nav = window.localStorage.getItem("pos.navOpen");
    if (nav !== null) setNavOpen(nav === "1");
  }, [canPickAllStores]);

  const setStoreId = useCallback((id: number | null) => {
    setStoreIdState(id);
    window.localStorage.setItem("pos.storeId", id === null ? "all" : String(id));
  }, []);

  const toggleNav = useCallback(() => {
    setNavOpen((v) => {
      window.localStorage.setItem("pos.navOpen", v ? "0" : "1");
      return !v;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      user,
      stores,
      storeId,
      store: stores.find((s) => s.id === storeId) ?? null,
      setStoreId,
      canPickAllStores,
      navOpen,
      toggleNav,
    }),
    [user, stores, storeId, setStoreId, canPickAllStores, navOpen, toggleNav]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
