import Link from "next/link";

export default function Brand({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label="vidSkify home">
      <span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-[7px] bg-accent shadow-[0_1px_0_rgba(255,255,255,0.35)_inset]">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 1.4v9.2L10.4 6 2 1.4Z" fill="#0a0a0c" />
        </svg>
      </span>
      {compact ? null : (
        <span className="text-[13px] font-semibold tracking-[0.08em] text-ink">vidSkify</span>
      )}
    </Link>
  );
}
