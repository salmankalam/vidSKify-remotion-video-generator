import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import StatusPill from "@/components/StatusPill";
import { ArrowRightIcon, PlayIcon, PlusIcon, SparklesIcon } from "@/components/icons";
import { LinkButton } from "@/components/ui";
import { aiModel, hasAI } from "@/lib/ai/client";
import { listProjects, summarize } from "@/lib/store";
import { formatSeconds } from "@/lib/timing";
import type { ProjectSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const projects = (await listProjects()).map(summarize);
  const ai = hasAI();
  const totalSeconds = projects.reduce((sum, project) => sum + project.durationSeconds, 0);
  const rendered = projects.filter((project) => project.status === "done").length;

  return (
    <main className="min-h-full pb-24">
      <AppHeader
        right={
          <>
            <ModelStatus connected={ai} model={ai ? aiModel() : null} />
            <LinkButton href="/new" size="md">
              <PlusIcon className="h-3.5 w-3.5" />
              New video
            </LinkButton>
          </>
        }
      />

      <div className="mx-auto max-w-[1280px] px-5 sm:px-7">
        <section className="flex flex-wrap items-end justify-between gap-8 pt-12 pb-9 sm:pt-16">
          <div>
            <p className="text-[10px] font-medium tracking-[0.22em] text-faint uppercase">Library</p>
            <h1 className="mt-3 text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] sm:text-[42px]">
              Your videos
            </h1>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted">
              Drafts, storyboards and finished renders. Open any project to edit the script, design or
              pacing — then export an MP4.
            </p>
          </div>

          {projects.length > 0 ? (
            <dl className="flex items-stretch gap-0 divide-x divide-line rounded-card border border-line bg-surface/60">
              <Stat label="Projects" value={String(projects.length)} />
              <Stat label="Rendered" value={String(rendered)} />
              <Stat label="Runtime" value={formatSeconds(totalSeconds)} />
            </dl>
          ) : null}
        </section>

        {projects.length === 0 ? (
          <EmptyLibrary ai={ai} />
        ) : (
          <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}

            <Link
              href="/new"
              className="group flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-surface/30 text-muted transition-colors hover:border-line-strong hover:bg-surface/70 hover:text-ink"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-raised transition-transform group-hover:scale-105">
                <PlusIcon className="h-4 w-4" />
              </span>
              <span className="text-[12px] font-medium">New video</span>
              <span className="text-[11px] text-faint">Start from a brief</span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3">
      <dt className="text-[10px] tracking-[0.1em] text-faint uppercase">{label}</dt>
      <dd className="timecode mt-1 text-[16px] text-ink">{value}</dd>
    </div>
  );
}

function ModelStatus({ connected, model }: { connected: boolean; model: string | null }) {
  return (
    <span className="hidden items-center gap-2 rounded-full border border-line bg-surface/60 py-1 pr-2.5 pl-2 text-[10px] text-muted md:inline-flex">
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-success" : "bg-faint"}`} />
      {connected ? (
        <>
          <span className="text-ink-soft">AI ready</span>
          <span className="timecode max-w-[180px] truncate text-faint">{model}</span>
        </>
      ) : (
        "Draft mode"
      )}
    </span>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const vertical = project.aspect === "9:16";
  return (
    <Link href={`/v/${project.id}`} className="group block">
      <div className="relative overflow-hidden rounded-card border border-line bg-surface transition-all duration-300 group-hover:border-line-strong group-hover:shadow-[0_30px_60px_-40px_rgba(0,0,0,0.9)]">
        <div className="relative aspect-[16/10] overflow-hidden bg-[#0b0b0f]">
          {project.posterUrl ? (
            vertical ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={project.posterUrl}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-xl"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={project.posterUrl}
                  alt=""
                  className="relative mx-auto h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.posterUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
              />
            )
          ) : (
            <PosterPlaceholder title={project.name} />
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />

          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
            <span className="rounded-full border border-white/10 bg-black/55 px-2 py-[3px] backdrop-blur">
              <StatusPill status={project.status} className="border-0 bg-transparent px-0 py-0" />
            </span>
          </div>

          <span className="timecode absolute top-2.5 right-2.5 rounded-[5px] border border-white/10 bg-black/50 px-1.5 py-0.5 text-[10px] text-white/75 backdrop-blur">
            {project.aspect}
          </span>

          <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/95 text-[#0a0a0c] shadow-lg">
              <PlayIcon className="ml-0.5 h-4 w-4" />
            </span>
          </span>

          <span className="timecode absolute right-2.5 bottom-2.5 rounded-[5px] bg-black/60 px-1.5 py-0.5 text-[10px] text-white/85 backdrop-blur">
            {formatSeconds(project.durationSeconds)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-medium text-ink">{project.name}</h2>
          <p className="mt-1 text-[11px] text-faint">
            {project.sceneCount} {project.sceneCount === 1 ? "scene" : "scenes"} ·{" "}
            {new Date(project.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
        </div>
        <ArrowRightIcon className="mt-0.5 h-3.5 w-3.5 -translate-x-1 text-faint opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
      </div>
    </Link>
  );
}

function PosterPlaceholder({ title }: { title: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0b0b0f]">
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_15%_0%,#1e1e27_0%,#0b0b0f_62%)]" />
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:34px_34px]" />
      <span className="relative line-clamp-2 max-w-[80%] text-center text-[17px] leading-snug font-medium tracking-[-0.01em] text-ink/45">
        {title}
      </span>
    </div>
  );
}

function EmptyLibrary({ ai }: { ai: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[16px] border border-line bg-surface">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(75%_100%_at_15%_0%,rgba(214,248,78,0.07),transparent_60%)]" />

      <div className="relative grid gap-10 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[10px] font-medium tracking-[0.06em] text-accent">
            <SparklesIcon className="h-3 w-3" />
            First project
          </span>
          <h2 className="mt-5 text-[27px] leading-[1.12] font-semibold tracking-[-0.025em] sm:text-[32px]">
            Start with a sentence.
            <br />
            Finish with a video.
          </h2>
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-muted">
            Describe what you want to make and vidSkify builds the script, shot list, palette and voiceover
            timing. Every part stays editable, then renders to MP4 on your machine.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <LinkButton href="/new" size="lg">
              <SparklesIcon className="h-4 w-4" />
              Generate your first video
            </LinkButton>
            <span className="text-[11px] text-faint">
              {ai ? "Free AI model ready" : "Works without a key"}
            </span>
          </div>
        </div>

        <StoryboardMock />
      </div>

      <div className="relative grid divide-y divide-line border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          ["Brief", "Describe it, drop references, or paste a URL."],
          ["Direct", "Tune scenes, type, colour and pacing."],
          ["Render", "Preview frame-accurate and download the MP4."],
        ].map(([title, copy], index) => (
          <div key={title} className="flex gap-3 px-6 py-4 sm:px-7">
            <span className="timecode mt-px text-[10px] text-faint">0{index + 1}</span>
            <div>
              <p className="text-[12px] font-medium text-ink">{title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{copy}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryboardMock() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <div className="absolute -top-3 right-8 left-8 h-full rotate-[3deg] rounded-card border border-line bg-raised/70" />
      <div className="absolute -top-1.5 right-4 left-4 h-full rotate-[1.4deg] rounded-card border border-line bg-elevated/80" />
      <div className="relative overflow-hidden rounded-card border border-line-strong bg-[#0a0a0d] shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]">
        <div className="relative aspect-video overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(90%_90%_at_20%_10%,#24242e_0%,#0c0c11_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_80%_90%,rgba(214,248,78,0.18),transparent_70%)]" />
          <div className="absolute inset-x-6 top-6">
            <p className="text-[9px] tracking-[0.2em] text-accent uppercase">Scene 02 · Split</p>
            <p className="mt-2 text-[22px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink">
              Roasted in
              <br />
              small batches
            </p>
            <div className="mt-3 h-px w-10 bg-accent" />
            <div className="mt-3 space-y-1.5">
              <span className="block h-1.5 w-24 rounded-full bg-white/15" />
              <span className="block h-1.5 w-20 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line/80 px-3 py-2">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3, 4].map((index) => (
              <span
                key={index}
                className={`h-1 rounded-full ${index === 1 ? "w-6 bg-accent" : "w-3 bg-line-strong"}`}
              />
            ))}
          </div>
          <span className="timecode text-[9px] text-faint">00:24 · 30fps</span>
        </div>
      </div>
    </div>
  );
}
