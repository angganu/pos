"use client";

import clsx from "clsx";

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-none flex-wrap items-end justify-between gap-3.5 border-b-2 border-divider px-6 py-4">
      <div className="min-w-0">
        <div className="label-kicker mb-1.5 text-brand-600">{kicker}</div>
        <h1 className="m-0 text-3xl">{title}</h1>
        {subtitle && <div className="mt-1.5 text-[13px] text-slate-7">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className={clsx("p-4", emphasis ? "bg-white ring-2 ring-ink" : "bg-white ring-1 ring-divider")}>
      <div className={clsx("label-kicker mb-2", emphasis && "text-brand-600")}>{label}</div>
      <div className="text-3xl font-extrabold leading-none">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-slate-7">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-slate-4 px-5 py-11 text-center text-sm text-slate-6">
      <div>{title}</div>
      {hint && <div className="mt-1 opacity-70">{hint}</div>}
    </div>
  );
}

export function Loading({ label = "Memuat data…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-10 text-sm text-slate-6">
      <span className="h-3 w-3 animate-pulse bg-brand-600" />
      {label}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="m-6 bg-brand-100 px-4 py-3 text-sm font-semibold text-brand-800 ring-1 ring-brand-300">
      {message}
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-none flex-wrap items-center gap-2.5 px-6 pt-4">{children}</div>;
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "px-3 py-1.5 text-xs font-semibold ring-1 ring-divider transition-colors",
        active ? "bg-ink text-white" : "bg-white text-ink hover:bg-slate-2"
      )}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "560px",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full flex-col bg-white shadow-2xl"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-none border-b-2 border-divider px-5 py-3.5 text-lg font-extrabold">{title}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-none justify-end gap-2 border-t-2 border-divider px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
