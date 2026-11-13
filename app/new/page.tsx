"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import {
  AlertIcon,
  CaptionsIcon,
  CheckIcon,
  ImageIcon,
  LayersIcon,
  PaletteIcon,
  SparklesIcon,
  TypeIcon,
} from "@/components/icons";
import { Button, Field, Spinner, cx, fieldClass } from "@/components/ui";

const STAGES = [
  "Reading your brief",
  "Looking at your references",
  "Choosing a visual language",
  "Writing the script",
  "Building the shot list",
];

const EXAMPLES = [
  {
    label: "Product launch",
    text: "A 30-second launch teaser for a small-batch coffee roaster. Warm and handmade, not corporate. Show the roast process, the people and the morning ritual, then end on the new subscription.",
  },
  {
    label: "Explainer",
    text: "A 45-second explainer for a scheduling app for freelancers. Calm, confident, minimal. Explain the problem in the first beat, show three concrete benefits, and close with a clear call to action.",
  },
  {
    label: "Hiring",
    text: "A 25-second recruiting video for a design studio in Lisbon. Editorial and human, a little poetic. Talk about craft, small teams and the city, and invite senior designers to apply.",
  },
];

type Health = { ai: boolean; model: string | null; speech: boolean };

export default function NewVideoPage() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [url, setUrl] = useState("");
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => setHealth({ ai: Boolean(data.ai), model: data.model ?? null, speech: Boolean(data.speech) }))
      .catch(() => setHealth({ ai: false, model: null, speech: false }));
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setStage((value) => Math.min(value + 1, STAGES.length - 1)), 2600);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    return () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
  }, []);

  function addFiles(list: FileList | File[]) {
    const room = 4 - images.length;
    if (room <= 0) return;
    const accepted: { file: File; url: string }[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 6 * 1024 * 1024) {
        setError(`${file.name} is larger than 6MB.`);
        continue;
      }
      if (accepted.length >= room) break;
      accepted.push({ file, url: URL.createObjectURL(file) });
    }
    if (accepted.length) setImages((prev) => [...prev, ...accepted]);
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!brief.trim() && !url.trim()) {
      setError("Describe your vision or add a website to analyse.");
      return;
    }
    setBusy(true);
    setStage(0);
    setError(null);
    try {
      const form = new FormData();
      form.set("brief", brief.trim());
      form.set("url", url.trim());
      form.set("aspect", aspect);
      images.forEach((image) => form.append("images", image.file));
      const response = await fetch("/api/brief", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not build the draft.");
      router.push(`/v/${data.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-full">
      <AppHeader
        back={{ href: "/", label: "Library" }}
        right={
          <span className="hidden items-center gap-2 text-[11px] text-faint sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${health?.ai ? "bg-success" : "bg-faint"}`} />
            {health ? (health.ai ? health.model : "Draft mode") : "Checking AI…"}
          </span>
        }
      />

      <div className="mx-auto max-w-[1180px] px-5 pb-36 sm:px-7">
        <header className="pt-11 pb-9 sm:pt-14">
          <p className="text-[10px] font-medium tracking-[0.22em] text-faint uppercase">New project</p>
          <h1 className="mt-3 text-[32px] leading-[1.06] font-semibold tracking-[-0.03em] sm:text-[38px]">
            What are we making?
          </h1>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted">
            One paragraph is enough. vidSkify turns it into a scene-by-scene plan you can edit before you
            render.
          </p>
        </header>

        <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-10">
          <div className="space-y-5">
            <section className="rounded-card border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
                <label htmlFor="brief" className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                  The brief
                </label>
                <span className="timecode text-[10px] text-faint">{brief.length} / 2000</span>
              </div>
              <div className="p-4">
                <textarea
                  id="brief"
                  value={brief}
                  onChange={(event) => setBrief(event.target.value.slice(0, 2000))}
                  rows={8}
                  autoFocus
                  aria-describedby="brief-help"
                  placeholder="A 30-second launch teaser for a small-batch coffee roaster. Warm and handmade, not corporate. Show the roast process, the people, the morning ritual, and end with the new subscription."
                  className="min-h-[180px] w-full resize-y bg-transparent text-[14px] leading-[1.7] text-ink outline-none placeholder:text-faint/70"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-4 py-3">
                <span id="brief-help" className="text-[11px] text-faint">
                  Try an example
                </span>
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => setBrief(example.text)}
                    className="rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-card border border-line bg-surface p-4">
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                  References
                </h2>
                <span className="text-[11px] text-faint">Optional</span>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[11px] font-medium text-ink-soft">Images</p>
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      addFiles(event.dataTransfer.files);
                    }}
                    className={cx(
                      "rounded-control border border-dashed p-2 transition-colors",
                      dragging ? "border-accent/70 bg-accent/[0.04]" : "border-line bg-raised/40",
                    )}
                  >
                    {images.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="flex h-[104px] w-full flex-col items-center justify-center gap-2 rounded-[6px] text-center transition-colors hover:bg-raised"
                      >
                        <ImageIcon className="h-5 w-5 text-faint" />
                        <span className="text-[12px] text-ink-soft">Drop images or browse</span>
                        <span className="text-[10px] text-faint">Up to 4 · PNG, JPG</span>
                      </button>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5">
                        {images.map((image, index) => (
                          <div
                            key={image.url}
                            className="group relative aspect-square overflow-hidden rounded-[6px] border border-line"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={image.url} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              aria-label={`Remove image ${index + 1}`}
                              className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/75 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {images.length < 4 ? (
                          <button
                            type="button"
                            onClick={() => fileInput.current?.click()}
                            aria-label="Add another image"
                            className="flex aspect-square items-center justify-center rounded-[6px] border border-dashed border-line text-faint transition-colors hover:border-line-strong hover:text-ink"
                          >
                            +
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files) addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <p className="mt-2 text-[10px] leading-relaxed text-faint">
                    Used as scene imagery and styling cues.
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-medium text-ink-soft">Website</p>
                  <Field label="Link to analyse" hint="optional">
                    <input
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://your-site.com"
                      inputMode="url"
                      className={fieldClass}
                    />
                  </Field>
                  <p className="mt-2 text-[10px] leading-relaxed text-faint">
                    Reads the page&apos;s colours, type and a screenshot, then uses them in the video.
                  </p>
                  <p className="mt-2 text-[10px] leading-relaxed text-faint">
                    vidSkify reads the title, headings and copy so the script matches your product.
                  </p>
                </div>
              </div>
            </section>

            {error ? (
              <div className="flex items-start gap-2.5 rounded-control border border-danger/25 bg-danger/[0.06] px-3 py-2.5 text-[12px] text-danger">
                <AlertIcon className="mt-px h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <section className="order-1 rounded-card border border-line bg-surface p-4">
              <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">Format</h2>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Aspect ratio">
                {(["16:9", "9:16"] as const).map((ratio) => {
                  const active = aspect === ratio;
                  return (
                    <button
                      key={ratio}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setAspect(ratio)}
                      className={cx(
                        "group relative flex flex-col items-center gap-2 rounded-control border px-3 py-3 transition-colors",
                        active
                          ? "border-accent/60 bg-accent/[0.05]"
                          : "border-line bg-raised hover:border-line-strong",
                      )}
                    >
                      <span
                        className={cx(
                          "block rounded-[3px] border",
                          ratio === "16:9" ? "h-[30px] w-[53px]" : "h-[53px] w-[30px]",
                          active ? "border-accent/80 bg-accent/10" : "border-line-strong bg-elevated",
                        )}
                      />
                      <span className="text-[11px] font-medium text-ink">
                        {ratio === "16:9" ? "Landscape" : "Portrait"}
                      </span>
                      <span className="timecode text-[9px] text-faint">
                        {ratio === "16:9" ? "1920 × 1080" : "1080 × 1920"}
                      </span>
                      {active ? (
                        <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[#0a0a0c]">
                          <CheckIcon className="h-2.5 w-2.5" strokeWidth={2.4} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="order-4 rounded-card border border-line bg-surface p-4">
              <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                What you get
              </h2>
              <ul className="space-y-2.5">
                {[
                  { icon: LayersIcon, title: "4–8 scenes", copy: "Hook, story beats and a closing CTA." },
                  { icon: PaletteIcon, title: "Design system", copy: "Palette and font pairing, editable." },
                  { icon: TypeIcon, title: "Script + captions", copy: "Narration and timed on-screen cues." },
                  { icon: CaptionsIcon, title: "Rendered MP4", copy: "H.264 at 30fps, ready to download." },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-2.5">
                    <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                    <span>
                      <span className="block text-[12px] text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{item.copy}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="order-3 rounded-card border border-line bg-surface/50 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${health?.ai ? "bg-success" : "bg-faint"}`} />
                {health === null
                  ? "Checking the AI connection…"
                  : health.ai
                    ? "Free model connected"
                    : "No key — rule-based draft"}
              </div>
              <p className="timecode mt-1.5 truncate text-[10px] text-faint">
                {health?.ai ? health.model : "APINEX_API_KEY not set"}
              </p>
            </div>

            <div className="order-2 hidden lg:block">
              <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
                {busy ? <Spinner className="h-4 w-4" /> : <SparklesIcon className="h-4 w-4" />}
                {busy ? "Generating…" : "Generate draft"}
              </Button>
              <p className="mt-2 text-center text-[10px] leading-relaxed text-faint">
                {health?.ai ? "Usually takes 15–40 seconds" : "Builds a rule-based draft"}
              </p>
            </div>
          </aside>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/85 backdrop-blur-md lg:hidden">
            <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-7">
              <p className="hidden text-[11px] text-faint sm:block">
                {health?.ai
                  ? "First draft usually takes 15–40 seconds."
                  : "No API key — vidSkify will build an editable rule-based draft."}
              </p>
              <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full sm:w-auto">
                {busy ? <Spinner className="h-4 w-4" /> : <SparklesIcon className="h-4 w-4" />}
                {busy ? "Generating…" : "Generate draft"}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {busy ? <GeneratingOverlay stage={stage} aspect={aspect} /> : null}
    </main>
  );
}

function GeneratingOverlay({ stage, aspect }: { stage: number; aspect: "16:9" | "9:16" }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/92 px-5 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-[420px]">
        <div className="mx-auto mb-8 w-full" style={{ maxWidth: aspect === "9:16" ? 132 : 320 }}>
          <div
            className="relative overflow-hidden rounded-card border border-line bg-[#0b0b10]"
            style={{ aspectRatio: aspect === "9:16" ? "9 / 16" : "16 / 9" }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(90%_90%_at_25%_15%,#23232c_0%,#0a0a0e_70%)]" />
            <div className="drift absolute inset-0 bg-[radial-gradient(55%_55%_at_50%_55%,rgba(214,248,78,0.22),transparent_72%)]" />
            <div className="absolute inset-x-5 top-5 space-y-2">
              <span className="block h-1 w-10 rounded-full bg-accent/80" />
              <span className="block h-3 w-3/4 rounded-sm bg-white/20" />
              <span className="block h-3 w-1/2 rounded-sm bg-white/10" />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-line/60">
              <div
                className="h-full bg-accent transition-[width] duration-700"
                style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <ol className="space-y-2">
          {STAGES.map((label, index) => {
            const done = index < stage;
            const active = index === stage;
            return (
              <li
                key={label}
                className={cx(
                  "flex items-center gap-2.5 rounded-control px-2.5 py-1.5 text-[12px] transition-colors",
                  active ? "bg-raised text-ink" : done ? "text-muted" : "text-faint",
                )}
              >
                <span
                  className={cx(
                    "flex h-4 w-4 items-center justify-center rounded-full border",
                    done
                      ? "border-success/40 bg-success/10 text-success"
                      : active
                        ? "border-accent/50 text-accent"
                        : "border-line text-faint",
                  )}
                >
                  {done ? (
                    <CheckIcon className="h-2.5 w-2.5" strokeWidth={2.6} />
                  ) : active ? (
                    <Spinner className="h-2.5 w-2.5" />
                  ) : (
                    <span className="h-1 w-1 rounded-full bg-current" />
                  )}
                </span>
                {label}
              </li>
            );
          })}
        </ol>

        <p className="mt-6 text-center text-[11px] text-faint">Keep this tab open — it takes a moment.</p>
      </div>
    </div>
  );
}
