import Link from "next/link";
import Brand from "./Brand";
import { ArrowLeftIcon } from "./icons";

export default function AppHeader({
  back,
  right,
  width = "max-w-[1280px]",
}: {
  back?: { href: string; label: string };
  right?: React.ReactNode;
  width?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/80 backdrop-blur-md">
      <div className={`mx-auto flex h-16 items-center gap-4 px-5 sm:px-7 ${width}`}>
        {back ? (
          <Link
            href={back.href}
            className="-ml-2 inline-flex items-center gap-1.5 rounded-control px-2 py-1.5 text-[12px] text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            {back.label}
          </Link>
        ) : null}
        <Brand />
        <div className="ml-auto flex items-center gap-3">{right}</div>
      </div>
    </header>
  );
}
