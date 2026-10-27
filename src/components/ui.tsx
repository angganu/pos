"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { initials } from "@/lib/format";

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

/** One choice out of a few, as joined buttons — for form fields where a dropdown hides too much. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "h-10",
}: {
  value: T | "";
  options: [T, string][];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className="flex">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            "flex-1 whitespace-nowrap px-3 text-sm font-semibold ring-1 ring-divider transition-colors",
            className,
            value === v ? "bg-ink text-white" : "bg-white text-ink hover:bg-slate-2"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A person's photo, or their initials on a grey square when there is none. */
export function Avatar({ name, src, size = 34 }: { name: string; src?: string | null; size?: number }) {
  const box = { width: size, height: size };
  if (src) {
    // A plain <img>: the photo comes from our own authenticated API and the optimizer is off.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={box} className="flex-none bg-slate-3 object-cover" />;
  }
  return (
    <div
      aria-hidden
      style={{ ...box, fontSize: Math.round(size * 0.34) }}
      className="flex flex-none items-center justify-center bg-slate-3 font-extrabold text-slate-8"
    >
      {initials(name)}
    </div>
  );
}

const ACTION_TONE = {
  neutral: "bg-slate-2 text-ink hover:bg-slate-3",
  primary: "bg-brand-100 text-brand-700 hover:bg-brand-600 hover:text-white",
  success: "bg-teal-100 text-teal-700 hover:bg-teal-600 hover:text-white",
  warning: "bg-amber-100 text-amber-700 hover:bg-amber-600 hover:text-white",
  danger: "bg-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white",
} as const;

/**
 * An icon-only row action on a tinted square. Its name shows in a tooltip on hover or
 * keyboard focus and is what screen readers announce. With `href` it is a link.
 */
export function IconAction({
  label,
  icon: Icon,
  tone = "neutral",
  href,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  tone?: keyof typeof ACTION_TONE;
  href?: string;
  onClick?: () => void;
}) {
  const className = clsx(
    "group relative inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center no-underline transition-colors",
    ACTION_TONE[tone]
  );
  const content = (
    <>
      <Icon size={15} strokeWidth={2.2} aria-hidden />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap bg-ink px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </>
  );
  return href ? (
    <Link href={href} aria-label={label} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" aria-label={label} onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/** Ruled table for printed documents: every cell boxed, each row kept whole across page breaks. */
export const PAPER_TABLE =
  "w-full border-collapse [print-color-adjust:exact] [&_tr]:break-inside-avoid " +
  "[&_td]:border [&_td]:border-ink [&_td]:px-2 [&_td]:py-1.5 " +
  "[&_th]:border [&_th]:border-ink [&_th]:bg-slate-2 [&_th]:px-2 [&_th]:py-1 " +
  "[&_th]:text-[11px] [&_th]:font-extrabold [&_th]:uppercase [&_th]:tracking-[0.08em]";

/** An empty box to tick by hand on a printed page — drawn for paper, not a form control. */
export function CheckBox() {
  return <span aria-hidden className="inline-block h-4 w-4 border-[1.5px] border-ink align-middle" />;
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

export type ComboOption = { value: string; label: string; disabled?: boolean };

/** Drop-in replacement for <select> that lets the user type to filter options. */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Pilih…",
  className = "input",
  disabled,
  emptyText = "Tidak ada hasil.",
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  emptyText?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function place() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  function openList() {
    if (disabled) return;
    place();
    setOpen(true);
    setActive(0);
  }

  function closeList() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function commit(opt: ComboOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    closeList();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) commit(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeList();
    } else if (e.key === "Tab") {
      closeList();
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        className={clsx(className, "pr-8")}
        placeholder={placeholder}
        value={open ? query : selected?.label ?? ""}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={closeList}
      />
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-5" />
      {open &&
        rect &&
        createPortal(
          <ul
            id={listId}
            role="listbox"
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 9999 }}
            className="max-h-56 overflow-y-auto bg-white py-1 text-sm shadow-2xl ring-1 ring-divider"
          >
            {filtered.length === 0 && <li className="px-3 py-2 text-slate-6">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={clsx(
                  "cursor-pointer px-3 py-1.5",
                  i === active && "bg-brand-100",
                  o.value === value && "font-semibold",
                  o.disabled && "pointer-events-none opacity-45"
                )}
              >
                {o.label}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
