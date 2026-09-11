"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

/**
 * Minimal fetch-with-state hook: data / error / loading + manual refresh.
 * Deliberately dependency-free so the project stays easy to hand over.
 */
export default function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(url);
      if (id === reqId.current) setData(result);
    } catch (err) {
      if (id === reqId.current) setError(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return { data, error, loading, refresh: load, setData };
}
