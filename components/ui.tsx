import React from "react";
import Link from "next/link";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./icons";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/* --------------------------------- button -------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-[#0a0a0c] hover:bg-white active:bg-ink-soft shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_8px_20px_-12px_rgba(0,0,0,0.9)]",
  secondary:
    "border border-line bg-raised text-ink hover:border-line-strong hover:bg-elevated",
  ghost: "text-muted hover:bg-raised hover:text-ink",
  accent: "bg-accent text-[#0a0a0c] hover:brightness-[1.06]",
  danger: "border border-danger/25 text-danger hover:bg-danger/10",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-[7px] px-2.5 text-xs",
  md: "h-9 gap-2 rounded-control px-3.5 text-[13px]",
  lg: "h-11 gap-2 rounded-[10px] px-5 text-sm",
  icon: "h-9 w-9 rounded-control",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cx(
        "inline-flex shrink-0 items-center justify-center font-medium transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-40",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex shrink-0 items-center justify-center font-medium transition-colors duration-150",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  variant = "ghost",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: ButtonVariant;
}) {
  return (
    <Button variant={variant} size="icon" aria-label={label} title={label} className={className} {...props}>
      {children}
    </Button>
  );
}

/* --------------------------------- fields -------------------------------- */

export const fieldClass =
  "w-full rounded-control border border-line bg-raised px-3 py-2 text-[13px] text-ink placeholder:text-faint/80 transition-colors outline-none hover:border-line-strong focus:border-accent/60 focus:bg-elevated";

export const selectClass = cx(fieldClass, "cursor-pointer pr-8");

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[11px] font-medium tracking-[0.08em] text-faint uppercase">
          {label}
        </label>
        {hint ? <span className="timecode text-[11px] text-faint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-4 rounded-control border border-line bg-raised px-3 py-2.5 text-left transition-colors hover:border-line-strong disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{description}</span>
        ) : null}
      </span>
      <span
        className={cx(
          "relative h-[20px] w-[34px] shrink-0 rounded-full border transition-colors",
          checked ? "border-accent/50 bg-accent" : "border-line-strong bg-elevated",
        )}
      >
        <span
          className={cx(
            "absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all",
            checked ? "left-[16px] bg-[#0a0a0c]" : "left-[2px] bg-muted",
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------- segmented ------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-[9px] border border-line bg-raised p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              "rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-35",
              active ? "bg-elevated text-ink shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]" : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- panel --------------------------------- */

export function Panel({
  title,
  hint,
  action,
  children,
  className,
}: {
  title?: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-card border border-line bg-surface p-4", className)}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">{title}</h3>
            {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function MetaChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "timecode inline-flex items-center gap-1.5 rounded-[6px] border border-line/80 bg-surface/70 px-1.5 py-0.5 text-[10px] text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------- misc ---------------------------------- */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

export type ToastTone = "error" | "success" | "info";

export function Toast({
  message,
  tone = "info",
  onClose,
}: {
  message: string;
  tone?: ToastTone;
  onClose: () => void;
}) {
  const Icon = tone === "error" ? AlertIcon : tone === "success" ? CheckIcon : InfoIcon;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fade fixed bottom-6 left-1/2 z-50 flex w-[min(92vw,440px)] -translate-x-1/2 items-start gap-3 rounded-[10px] border border-line-strong bg-elevated/95 px-3.5 py-3 text-[12px] leading-relaxed text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur"
    >
      <Icon
        className={cx(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "error" ? "text-danger" : tone === "success" ? "text-success" : "text-accent",
        )}
      />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 rounded p-1 text-faint transition-colors hover:text-ink"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function InlineNotice({
  children,
  tone = "info",
  className,
}: {
  children: React.ReactNode;
  tone?: "info" | "warn";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex gap-2.5 rounded-control border px-3 py-2.5 text-[11px] leading-relaxed",
        tone === "warn"
          ? "border-amber-300/20 bg-amber-300/[0.05] text-amber-100/85"
          : "border-line bg-raised text-muted",
        className,
      )}
    >
      <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0 opacity-70" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
