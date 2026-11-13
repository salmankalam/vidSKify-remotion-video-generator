import type { RenderState } from "@/lib/types";
import { cx } from "./ui";

const STYLES: Record<RenderState["status"], { label: string; className: string; dot: string }> = {
  idle: { label: "Draft", className: "border-line text-muted", dot: "bg-faint" },
  queued: { label: "Queued", className: "border-accent/25 text-accent", dot: "bg-accent animate-pulse" },
  preparing: { label: "Preparing", className: "border-accent/25 text-accent", dot: "bg-accent animate-pulse" },
  rendering: { label: "Rendering", className: "border-accent/25 text-accent", dot: "bg-accent animate-pulse" },
  done: { label: "Rendered", className: "border-success/25 text-success", dot: "bg-success" },
  error: { label: "Failed", className: "border-danger/25 text-danger", dot: "bg-danger" },
};

export default function StatusPill({
  status,
  label,
  className,
}: {
  status: RenderState["status"];
  label?: string;
  className?: string;
}) {
  const style = STYLES[status] ?? STYLES.idle;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border bg-surface/60 px-2 py-[3px] text-[10px] font-medium tracking-[0.04em]",
        style.className,
        className,
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", style.dot)} />
      {label ?? style.label}
    </span>
  );
}
