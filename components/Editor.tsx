"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FONT_PAIRS,
  IMAGE_TREATMENTS,
  LAYOUTS,
  PALETTE_KEYS,
  PALETTE_PRESETS,
  SFX_PACKS,
  TRANSITIONS,
  VOICES,
  emptyScene,
  resolveSfxPack,
  type ConcreteSfxPack,
  type Layout,
  type PaletteKey,
  type Scene,
  type VideoSpec,
} from "@/lib/spec";
import { computeTimeline, formatSeconds } from "@/lib/timing";
import { FONT_PAIR_META, LAYOUT_META, SFX_PACK_META, VOICE_LABELS } from "@/lib/typography";
import type { Asset, Project, Revision, RenderState } from "@/lib/types";
import type { SfxMap, VideoCompositionProps } from "@/remotion/types";
import Brand from "@/components/Brand";
import StatusPill from "@/components/StatusPill";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  ChevronUpIcon,
  CopyIcon,
  DownloadIcon,
  FilmIcon,
  ImageIcon,
  InfoIcon,
  LayersIcon,
  MusicIcon,
  PaletteIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  SpeakerIcon,
  TrashIcon,
  UndoIcon,
} from "@/components/icons";
import {
  Button,
  Field,
  IconButton,
  InlineNotice,
  MetaChip,
  Panel,
  Segmented,
  Spinner,
  Toast,
  Toggle,
  cx,
  fieldClass,
  selectClass,
} from "@/components/ui";

const PreviewPane = dynamic(() => import("@/components/PreviewPane"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full animate-pulse rounded-[10px] border border-line bg-raised"
      style={{ aspectRatio: "16 / 9" }}
    />
  ),
});

type PanelId = "scene" | "design" | "audio" | "assistant";
type View = "preview" | "output";
type ChatMessage = { role: "user" | "assistant"; text: string; error?: boolean };
type ToastState = { text: string; tone: "error" | "success" | "info" } | null;

const PANELS: { id: PanelId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "scene", label: "Scene", icon: LayersIcon },
  { id: "design", label: "Design", icon: PaletteIcon },
  { id: "audio", label: "Audio", icon: SpeakerIcon },
  { id: "assistant", label: "AI", icon: SparklesIcon },
];

const QUICK_EDITS = [
  "Make it more energetic",
  "Shorten the narration everywhere",
  "Rewrite scene 2 to be more concrete",
  "Warmer palette, more editorial type",
  "Switch it to portrait",
];

const IMAGE_TREATMENT_LABEL: Record<string, string> = {
  none: "Original",
  dim: "Dimmed for text",
  duotone: "Brand duotone",
  blur: "Soft blur",
};

const FONT_PREVIEW: Record<string, string> = {
  modern: "ui-sans-serif, system-ui, sans-serif",
  editorial: 'Georgia, "Times New Roman", serif',
  bold: 'Impact, "Arial Narrow", sans-serif',
};

/** Storyboard mini-frame: a real shape preview, not just a text row. */
function SceneThumb({ scene, spec, url }: { scene: Scene; spec: VideoSpec; url: string | null }) {
  const p = spec.brand.palette;
  const portrait = spec.meta.aspect === "9:16";
  const centered = scene.layout === "hook" || scene.layout === "statement" || scene.layout === "cta";
  return (
    <div
      className={cx(
        "relative shrink-0 overflow-hidden rounded-[4px] border border-line/80",
        portrait ? "w-[26px]" : "w-[46px]",
      )}
      style={{ aspectRatio: portrait ? "9 / 16" : "16 / 9", backgroundColor: p.background }}
    >
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(150deg, ${p.surface}, ${p.background})` }}
      />
      {url ? (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-90"
          style={{ backgroundImage: `url("${url}")` }}
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(120% 100% at 20% 0%, ${p.accent}40, transparent 65%)` }}
      />
      {centered ? (
        <div className="absolute inset-x-[20%] top-1/2 flex -translate-y-1/2 flex-col gap-[2px]">
          <div className="h-[2px] w-full rounded-full" style={{ backgroundColor: p.primary, opacity: 0.9 }} />
          <div className="h-[2px] w-3/5 rounded-full" style={{ backgroundColor: p.primary, opacity: 0.4 }} />
        </div>
      ) : (
        <>
          <div className="absolute top-[16%] right-[12%] h-[26%] w-[24%] rounded-[1px]" style={{ backgroundColor: p.accent, opacity: 0.6 }} />
          <div className="absolute inset-x-[16%] bottom-[16%] flex flex-col gap-[2px]">
            <div className="h-[2px] w-4/5 rounded-full" style={{ backgroundColor: p.primary, opacity: 0.9 }} />
            <div className="h-[2px] w-1/2 rounded-full" style={{ backgroundColor: p.primary, opacity: 0.38 }} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Large preview for an uploaded file. The rail and inspector tiles are too small
 * to judge a photo, so a real lightbox (image or audio) opens on click.
 */
function MediaLightbox({
  asset,
  url,
  sceneLabel,
  onUseInScene,
  onDelete,
  onClose,
}: {
  asset: Asset;
  url: string;
  sceneLabel?: string;
  onUseInScene?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isAudio = asset.kind === "music";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={asset.filename}
      onClick={onClose}
      className="fade fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full max-w-[min(94vw,1100px)] flex-col overflow-hidden rounded-[10px] border border-line-strong bg-surface shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[12px] text-ink">{asset.filename}</p>
            <p className="timecode mt-0.5 text-[10px] text-faint">
              {asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ""}
              {Math.max(1, Math.round(asset.bytes / 1024))} KB
            </p>
          </div>
          <IconButton label="Close preview" onClick={onClose} className="h-7 w-7">
            <CloseIcon className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#070709] p-3">
          {isAudio ? (
            <div className="w-full max-w-[560px] px-2 py-6">
              <div className="mb-4 flex items-center justify-center gap-2 text-[11px] text-faint">
                <MusicIcon className="h-4 w-4 text-accent" />
                Music bed
              </div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={url} controls autoPlay className="w-full" />
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={asset.filename}
              className="max-h-[70vh] max-w-full rounded-[6px] object-contain"
            />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3">
          {onUseInScene ? (
            <Button variant="primary" size="sm" onClick={onUseInScene}>
              Use in {sceneLabel ?? "scene"}
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="danger" size="sm" onClick={onDelete}>
              Delete
            </Button>
          ) : null}
          <span className="ml-auto hidden text-[10px] text-faint sm:inline">Esc to close</span>
        </div>
      </div>
    </div>
  );
}

export default function Editor({ initialProject }: { initialProject: Project }) {
  const projectId = initialProject.id;
  const [spec, setSpec] = useState<VideoSpec>(initialProject.spec);
  const [assets, setAssets] = useState<Asset[]>(initialProject.assets);
  const [revisions, setRevisions] = useState<Revision[]>(initialProject.revisions);
  const [render, setRender] = useState<RenderState>(initialProject.render);
  const [selected, setSelected] = useState(0);
  const [panel, setPanel] = useState<PanelId>("scene");
  const [view, setView] = useState<View>("preview");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [toast, setToast] = useState<ToastState>(null);
  const [notice, setNotice] = useState(initialProject.brief.notes || "");
  const [dirty, setDirty] = useState(false);
  const [aiState, setAiState] = useState<"unknown" | "on" | "off">("unknown");
  const [speech, setSpeech] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [instruction, setInstruction] = useState("");
  const [thinking, setThinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seek, setSeek] = useState<{ frame: number; nonce: number } | undefined>();
  const imageInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const sfxPlayer = useRef<HTMLAudioElement | null>(null);
  const [previewing, setPreviewing] = useState<ConcreteSfxPack | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<Asset | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasBox, setCanvasBox] = useState({ width: 0, height: 0 });

  // Measure the stage so the preview can use every available pixel of height
  // instead of guessing from the viewport. Portrait clips then stay narrow and
  // hand their width back to the inspector panels.
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setCanvasBox({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const lastSaved = useRef(JSON.stringify(initialProject.spec));
  const previousStatus = useRef(initialProject.render.status);

  const specJson = JSON.stringify(spec);
  const timeline = useMemo(() => computeTimeline(spec, render.durations), [spec, render.durations]);
  const activeIndex = Math.min(selected, spec.scenes.length - 1);
  const scene = spec.scenes[activeIndex];
  const timedScene = timeline.scenes[activeIndex];
  const isRendering = ["queued", "preparing", "rendering"].includes(render.status);
  const hasOutput = render.status === "done" && Boolean(render.videoFile);
  const downloadUrl = hasOutput
    ? `/api/projects/${projectId}/output/video.mp4?download=1&v=${encodeURIComponent(render.finishedAt ?? "")}`
    : null;

  /* --------------------------------- data --------------------------------- */

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => {
        setAiState(data.ai ? "on" : "off");
        setSpeech(Boolean(data.speech));
        setModel(data.model ?? null);
      })
      .catch(() => setAiState("off"));
  }, []);

  useEffect(() => {
    setSelected((value) => Math.min(value, spec.scenes.length - 1));
  }, [spec.scenes.length]);

  useEffect(() => {
    // Compare against what is on disk so a StrictMode mount is never "dirty".
    if (specJson !== lastSaved.current) setDirty(true);
  }, [specJson]);

  useEffect(() => {
    if (specJson === lastSaved.current) return;
    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ spec }),
        });
        if (!response.ok) throw new Error("save failed");
        lastSaved.current = specJson;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [specJson, spec, projectId]);

  useEffect(() => {
    if (!isRendering) return;
    let alive = true;
    const tick = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        if (!response.ok) return;
        const data: Project = await response.json();
        if (!alive) return;
        setRender(data.render);
        setAssets(data.assets);
        setRevisions(data.revisions);
      } catch {
        /* keep polling */
      }
    };
    void tick();
    const timer = setInterval(tick, 1200);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isRendering, projectId]);

  useEffect(() => {
    if (previousStatus.current !== "done" && render.status === "done") setView("output");
    previousStatus.current = render.status;
  }, [render.status]);

  useEffect(() => {
    if (render.status === "error" && render.error) {
      setToast({ text: render.error, tone: "error" });
    }
  }, [render.status, render.error]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ------------------------------- preview -------------------------------- */

  const images = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of assets) {
      if (asset.kind === "image") map[asset.id] = `/api/assets/${projectId}/${asset.filename}`;
    }
    return map;
  }, [assets, projectId]);

  const sceneAudio = useMemo(() => {
    const map: Record<string, string> = {};
    for (const current of spec.scenes) {
      const narration = current.narration.trim();
      const match = assets
        .filter(
          (asset) =>
            asset.kind === "audio" &&
            asset.sceneId === current.id &&
            render.audioScript[current.id] === narration,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (match) map[current.id] = `/api/assets/${projectId}/${match.filename}`;
    }
    return map;
  }, [assets, render.audioScript, spec.scenes, projectId]);

  const musicAsset = assets.find(
    (asset) => asset.kind === "music" && asset.id === spec.audio.musicAssetId,
  );
  const sfxPack = resolveSfxPack(spec.audio.sfxPack ?? "auto", spec.meta.tone);
  const siteAsset = assets.find((asset) => asset.origin === "site");
  const siteHost = initialProject.brief.url
    ? initialProject.brief.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    : null;

  const compositionProps: VideoCompositionProps = useMemo(() => {
    const sfx: SfxMap = {};
    if (spec.audio.sfx) {
      for (const transition of ["fade", "slide", "wipe"] as const) {
        sfx[transition] = `/api/sfx/${sfxPack}-${transition}.wav`;
      }
    }
    return {
      spec,
      images,
      sceneAudio,
      music: musicAsset ? `/api/assets/${projectId}/${musicAsset.filename}` : null,
      sfx,
      sfxVolume: spec.audio.sfxVolume ?? 0.4,
      durations: render.durations,
    };
  }, [spec, images, sceneAudio, musicAsset, projectId, render.durations, sfxPack]);

  const sceneImage = (scene: Scene) =>
    scene.imageAssetId ? (images[scene.imageAssetId] ?? null) : null;

  /* -------------------------------- actions ------------------------------- */

  /** Plays the shared library file for a pack — the same WAV the render uses. */
  function previewSfx(pack: ConcreteSfxPack) {
    sfxPlayer.current?.pause();
    const audio = new Audio(`/api/sfx/${pack}-fade.wav`);
    audio.volume = Math.min(1, Math.max(0.1, spec.audio.sfxVolume || 0.4));
    sfxPlayer.current = audio;
    setPreviewing(pack);
    audio.onended = () => setPreviewing((current) => (current === pack ? null : current));
    audio.play().catch(() => setPreviewing(null));
  }

  async function refreshSite() {
    setSiteBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/analyze-site`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not analyse the site.");
      if (data.project) {
        setSpec(data.project.spec);
        setAssets(data.project.assets);
        setRevisions(data.project.revisions);
        setRender(data.project.render);
      }
      setToast({
        text: data.screenshot
          ? `Captured ${data.host} — palette, type and screenshot applied.`
          : `Captured ${data.host} — palette and type applied.`,
        tone: "success",
      });
    } catch (error: any) {
      setToast({ text: error?.message ?? "Could not analyse the site.", tone: "error" });
    } finally {
      setSiteBusy(false);
    }
  }

  function selectScene(index: number, switchPanel = true) {
    setSelected(index);
    if (switchPanel) setPanel("scene");
    const timed = timeline.scenes[index];
    if (timed) setSeek({ frame: timed.from + 2, nonce: Date.now() });
  }

  function updateScene(index: number, patch: Partial<Scene>) {
    setSpec((prev) => ({
      ...prev,
      scenes: prev.scenes.map((current, i) => (i === index ? { ...current, ...patch } : current)),
    }));
  }

  function addScene(layout: Layout = "split") {
    if (spec.scenes.length >= 12) {
      setToast({ text: "A video can have at most 12 scenes.", tone: "error" });
      return;
    }
    const nextScene: Scene = { ...emptyScene(layout), heading: "New scene", body: "", narration: "" };
    setSpec((prev) => ({ ...prev, scenes: [...prev.scenes, nextScene] }));
    setSelected(spec.scenes.length);
    setPanel("scene");
  }

  function duplicateScene(index: number) {
    if (spec.scenes.length >= 12) return;
    const copy: Scene = {
      ...spec.scenes[index],
      id: `s${Math.random().toString(36).slice(2, 8)}`,
      durationSeconds: null,
    };
    setSpec((prev) => {
      const scenes = [...prev.scenes];
      scenes.splice(index + 1, 0, copy);
      return { ...prev, scenes };
    });
    setSelected(index + 1);
  }

  function removeScene(index: number) {
    if (spec.scenes.length <= 1) {
      setToast({ text: "A video needs at least one scene.", tone: "error" });
      return;
    }
    setSpec((prev) => ({ ...prev, scenes: prev.scenes.filter((_, i) => i !== index) }));
    setSelected(Math.max(0, index - 1));
  }

  function moveScene(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= spec.scenes.length) return;
    setSpec((prev) => {
      const scenes = [...prev.scenes];
      [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
      return { ...prev, scenes };
    });
    setSelected(target);
  }

  async function flushSave() {
    if (specJson === lastSaved.current) return;
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec }),
    });
    lastSaved.current = specJson;
    setSaveState("saved");
  }

  async function startRender() {
    try {
      await flushSave();
      const response = await fetch(`/api/projects/${projectId}/render`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not start the render.");
      setDirty(false);
      setView("preview");
      setRender((prev) => ({ ...prev, status: "queued", message: "Queued", progress: 0, error: null }));
    } catch (err: any) {
      setToast({ text: err?.message ?? "Could not start the render.", tone: "error" });
    }
  }

  async function cancelRender() {
    await fetch(`/api/projects/${projectId}/render/cancel`, { method: "POST" });
    setRender((prev) => ({ ...prev, status: "idle", message: "Cancelled", progress: 0 }));
  }

  async function uploadFiles(files: FileList | File[], kind: "image" | "music") {
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("kind", kind);
      Array.from(files).forEach((file) => form.append("files", file));
      const response = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Upload failed.");
      setAssets(data.assets);
      if (kind === "music") {
        setSpec((prev) => ({ ...prev, audio: { ...prev.audio, musicAssetId: data.spec.audio.musicAssetId } }));
      }
    } catch (err: any) {
      setToast({ text: err?.message ?? "Upload failed.", tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function deleteAsset(asset: Asset) {
    const response = await fetch(`/api/projects/${projectId}/assets/${asset.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setToast({ text: data.error ?? "Could not remove that file.", tone: "error" });
      return;
    }
    setAssets(data.assets);
    setSpec((prev) => ({
      ...prev,
      audio: {
        ...prev.audio,
        musicAssetId: prev.audio.musicAssetId === asset.id ? null : prev.audio.musicAssetId,
      },
      scenes: prev.scenes.map((current) =>
        current.imageAssetId === asset.id ? { ...current, imageAssetId: null } : current,
      ),
    }));
  }

  async function sendInstruction(text?: string) {
    const value = (text ?? instruction).trim();
    if (!value || thinking) return;
    setThinking(true);
    setInstruction("");
    setChat((prev) => [...prev, { role: "user", text: value }]);
    try {
      const response = await fetch(`/api/projects/${projectId}/edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: value, spec }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The AI edit failed.");
      setSpec(data.spec);
      lastSaved.current = JSON.stringify(data.spec);
      setSaveState("saved");
      setRevisions(data.project.revisions);
      setAssets(data.project.assets);
      setChat((prev) => [...prev, { role: "assistant", text: data.note }]);
    } catch (err: any) {
      setChat((prev) => [
        ...prev,
        { role: "assistant", text: err?.message ?? "The AI edit failed.", error: true },
      ]);
    } finally {
      setThinking(false);
    }
  }

  async function undo() {
    const revision = revisions[0];
    if (!revision) return;
    const response = await fetch(`/api/projects/${projectId}/revert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revisionId: revision.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setToast({ text: data.error ?? "Nothing to undo.", tone: "error" });
      return;
    }
    setSpec(data.spec);
    lastSaved.current = JSON.stringify(data.spec);
    setRevisions(data.revisions);
    setAssets(data.assets);
    setChat((prev) => [...prev, { role: "assistant", text: `Reverted: ${revision.label}` }]);
  }

  /* --------------------------------- view --------------------------------- */

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/60 px-3 backdrop-blur">
        <Link
          href="/"
          aria-label="Back to library"
          title="Back to library"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Link>

        <div className="hidden md:block">
          <Brand compact />
        </div>
        <div className="mx-1 hidden h-5 w-px bg-line md:block" />

        <input
          value={spec.meta.title}
          onChange={(event) =>
            setSpec((prev) => ({ ...prev, meta: { ...prev.meta, title: event.target.value.slice(0, 140) } }))
          }
          aria-label="Video title"
          placeholder="Untitled video"
          className="min-w-0 max-w-[340px] flex-1 rounded-[6px] border border-transparent bg-transparent px-2 py-1 text-[13px] font-medium text-ink outline-none transition-colors placeholder:text-faint hover:border-line focus:border-line focus:bg-raised"
        />

        <span className="ml-1 hidden items-center gap-1.5 text-[11px] text-faint lg:flex">
          <span
            className={cx(
              "h-1.5 w-1.5 rounded-full",
              saveState === "saving"
                ? "animate-pulse bg-accent"
                : saveState === "error"
                  ? "bg-danger"
                  : "bg-success/70",
            )}
          />
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <StatusPill status={render.status} className="mr-1 hidden md:inline-flex" />

          <IconButton
            label={revisions[0] ? `Undo: ${revisions[0].label}` : "Nothing to undo"}
            onClick={undo}
            disabled={revisions.length === 0}
            className="hidden sm:inline-flex"
          >
            <UndoIcon className="h-4 w-4" />
          </IconButton>

          {downloadUrl ? (
            <a
              href={downloadUrl}
              aria-label="Download MP4"
              title="Download MP4"
              className="hidden h-9 w-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-ink sm:flex"
            >
              <DownloadIcon className="h-4 w-4" />
            </a>
          ) : null}

          {isRendering ? (
            <Button variant="secondary" size="sm" onClick={cancelRender} className="hidden sm:inline-flex">
              Cancel
            </Button>
          ) : null}

          <Button variant="primary" size="sm" onClick={startRender} disabled={isRendering}>
            {isRendering ? <Spinner className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">
              {isRendering ? "Rendering" : hasOutput ? (dirty ? "Update video" : "Re-render") : "Create video"}
            </span>
            <span className="sm:hidden">{isRendering ? "…" : "Render"}</span>
          </Button>
        </div>

        {isRendering ? (
          <span
            className="absolute inset-x-0 -bottom-px h-[2px] bg-accent/80 transition-[width] duration-500"
            style={{ width: `${Math.max(3, render.progress * 100)}%` }}
          />
        ) : null}
      </header>

      {notice ? (
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-accent/[0.05] px-4 py-2">
          <p className="flex min-w-0 items-start gap-2 text-[11px] leading-relaxed text-accent-soft/90">
            <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="min-w-0">{notice}</span>
          </p>
          <button
            onClick={() => setNotice("")}
            className="shrink-0 text-[11px] text-muted transition-colors hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:grid xl:grid-cols-[264px_minmax(0,1fr)_var(--inspector-w)] xl:overflow-hidden"
        style={{ "--inspector-w": spec.meta.aspect === "9:16" ? "476px" : "380px" } as React.CSSProperties}
      >
        {/* ----------------------------- storyboard ---------------------------- */}
        <aside className="order-2 flex min-h-0 shrink-0 flex-col border-t border-line bg-canvas xl:order-1 xl:border-t-0 xl:border-r">
          <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
            <h2 className="text-[10px] font-semibold tracking-[0.16em] text-faint uppercase">
              Storyboard <span className="ml-1 text-muted">{spec.scenes.length}</span>
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addScene("split")}
              className="h-7 gap-1 px-2 text-[11px]"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
              {spec.scenes.map((current, index) => {
                const active = index === activeIndex;
                const duration = timeline.scenes[index]?.durationSeconds ?? 0;
                return (
                  <div key={current.id} className="group w-[208px] shrink-0 xl:w-auto">
                    <button
                      onClick={() => selectScene(index)}
                      aria-current={active ? "true" : undefined}
                      className={cx(
                        "w-full rounded-[9px] border px-2.5 py-2 text-left transition-colors",
                        active
                          ? "border-accent/30 bg-accent/[0.06]"
                          : "border-transparent hover:border-line hover:bg-raised",
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <SceneThumb scene={current} spec={spec} url={sceneImage(current)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cx(
                                "timecode rounded-[3px] px-1 py-px text-[9px]",
                                active ? "bg-accent text-[#0a0a0c]" : "bg-elevated text-faint",
                              )}
                            >
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="truncate text-[9px] tracking-[0.1em] text-faint uppercase">
                              {LAYOUT_META[current.layout].label}
                            </span>
                            <span className="timecode ml-auto shrink-0 text-[10px] text-faint">
                              {formatSeconds(duration)}
                            </span>
                          </div>
                          <p
                            className={cx(
                              "mt-1 truncate text-[12px] leading-snug",
                              active ? "text-ink" : "text-ink-soft",
                            )}
                          >
                            {current.heading || "Untitled scene"}
                          </p>
                          <p className="mt-0.5 truncate text-[10.5px] text-faint">
                            {current.narration || "No narration"}
                          </p>
                        </div>
                      </div>
                    </button>

                    {active ? (
                      <div className="mt-0.5 mb-1 flex items-center gap-0.5 px-1">
                        <IconButton
                          label="Move scene up"
                          onClick={() => moveScene(index, -1)}
                          disabled={index === 0}
                          className="h-6 w-6"
                        >
                          <ChevronUpIcon className="h-3 w-3" />
                        </IconButton>
                        <IconButton
                          label="Move scene down"
                          onClick={() => moveScene(index, 1)}
                          disabled={index === spec.scenes.length - 1}
                          className="h-6 w-6"
                        >
                          <ChevronDownIcon className="h-3 w-3" />
                        </IconButton>
                        <IconButton
                          label="Duplicate scene"
                          onClick={() => duplicateScene(index)}
                          className="h-6 w-6"
                        >
                          <CopyIcon className="h-3 w-3" />
                        </IconButton>
                        <IconButton
                          label="Delete scene"
                          onClick={() => removeScene(index)}
                          className="ml-auto h-6 w-6 hover:text-danger"
                        >
                          <TrashIcon className="h-3 w-3" />
                        </IconButton>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 border-t border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[10px] font-semibold tracking-[0.16em] text-faint uppercase">Media</h3>
              <button
                onClick={() => imageInput.current?.click()}
                className="text-[11px] text-muted transition-colors hover:text-ink"
              >
                Upload
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5 xl:grid-cols-3">
              {assets
                .filter((asset) => asset.kind === "image")
                .map((asset) => (
                  <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-[5px] border border-line">
                    <button
                      onClick={() => setPreviewMedia(asset)}
                      className="block h-full w-full"
                      title="Open preview"
                      aria-label={`Preview ${asset.filename}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/assets/${projectId}/${asset.filename}`}
                        alt=""
                        className="h-full w-full object-cover transition-opacity hover:opacity-80"
                      />
                    </button>
                    <button
                      onClick={() => deleteAsset(asset)}
                      aria-label="Remove image"
                      className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-[9px] text-ink opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              <button
                onClick={() => imageInput.current?.click()}
                aria-label="Upload image"
                className="flex aspect-square items-center justify-center rounded-[5px] border border-dashed border-line text-faint transition-colors hover:border-line-strong hover:text-ink"
              >
                {uploading ? <Spinner className="h-3 w-3" /> : <PlusIcon className="h-3.5 w-3.5" />}
              </button>
            </div>
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void uploadFiles(event.target.files, "image");
                event.target.value = "";
              }}
            />
          </div>
        </aside>

        {/* -------------------------------- stage ------------------------------ */}
        <main className="order-1 flex min-h-0 min-w-0 flex-col bg-[#070709] xl:order-2">
          <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line/70 px-3">
            <Segmented<View>
              ariaLabel="Stage view"
              value={view}
              onChange={setView}
              options={[
                { value: "preview", label: "Preview" },
                { value: "output", label: "Output", disabled: !hasOutput },
              ]}
            />
            <div className="flex items-center gap-1.5">
              <MetaChip>{spec.meta.aspect}</MetaChip>
              <MetaChip>{timeline.fps} fps</MetaChip>
              <MetaChip className="hidden sm:inline-flex">
                {spec.scenes.length} scenes · {formatSeconds(timeline.totalSeconds)}
              </MetaChip>
            </div>
          </div>

          <div
            ref={canvasRef}
            className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden p-4 sm:p-6"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_0%,rgba(255,255,255,0.035),transparent_70%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,#1d1d24_1px,transparent_1px)] [background-size:26px_26px]" />

            {view === "preview" ? (
              <div
                className="relative w-full xl:w-[var(--player-w,100%)]"
                style={
                  canvasBox.height > 0
                    ? ({
                        "--player-w": `${Math.round(
                          Math.min(
                            canvasBox.width,
                            canvasBox.height * (spec.meta.aspect === "9:16" ? 9 / 16 : 16 / 9),
                          ),
                        )}px`,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                <PreviewPane
                  seek={seek}
                  compositionProps={compositionProps}
                  durationInFrames={timeline.totalInFrames}
                  fps={timeline.fps}
                  width={timeline.width}
                  height={timeline.height}
                />
              </div>
            ) : (
              <div className="relative flex h-full w-full flex-col items-center justify-center gap-4">
                {hasOutput && render.videoFile ? (
                  <>
                    <video
                      key={`${render.videoFile}-${render.finishedAt}`}
                      src={`/api/projects/${projectId}/output/${render.videoFile}`}
                      poster={
                        render.posterFile
                          ? `/api/projects/${projectId}/output/${render.posterFile}`
                          : undefined
                      }
                      controls
                      className="max-h-full max-w-full rounded-[10px] border border-line bg-black shadow-[0_30px_80px_-40px_rgba(0,0,0,1)]"
                    />
                    <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-faint">
                      <span className="timecode">
                        H.264 · {timeline.width}×{timeline.height} · {timeline.fps}fps
                      </span>
                      {downloadUrl ? (
                        <a
                          href={downloadUrl}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] text-ink transition-colors hover:border-line-strong"
                        >
                          <DownloadIcon className="h-3.5 w-3.5" />
                          Download MP4
                        </a>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="flex max-w-[320px] flex-col items-center text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-muted">
                      <FilmIcon className="h-5 w-5" />
                    </span>
                    <p className="mt-4 text-[13px] font-medium text-ink">Nothing rendered yet</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                      Your MP4 will appear here. The preview above is frame-accurate, so there are no
                      surprises.
                    </p>
                    <Button variant="secondary" size="sm" className="mt-4" onClick={startRender}>
                      <PlayIcon className="h-3.5 w-3.5" />
                      Create video
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-line bg-surface/40">
            {isRendering ? (
              <div className="h-[2px] w-full bg-line/60">
                <div
                  className="h-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.max(3, render.progress * 100)}%` }}
                />
              </div>
            ) : null}

            <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pt-2.5 pb-2">
              {timeline.scenes.map((timed, index) => {
                const active = index === activeIndex;
                return (
                  <button
                    key={timed.scene.id}
                    onClick={() => selectScene(index, false)}
                    style={{ flexGrow: Math.max(1, timed.durationInFrames), flexBasis: 0 }}
                    aria-current={active ? "true" : undefined}
                    title={`${index + 1}. ${timed.scene.heading} · ${formatSeconds(timed.durationSeconds)}`}
                    className={cx(
                      "group relative h-8 min-w-[34px] overflow-hidden rounded-[5px] border px-1.5 text-left transition-colors",
                      active
                        ? "border-accent/50 bg-accent/[0.12] text-ink"
                        : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    <span className="block truncate text-[10px] leading-7">{timed.scene.heading}</span>
                    {timed.measured ? (
                      <span className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-success" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2.5 text-[11px]">
              <span className="text-muted">
                <span className="timecode text-ink">{formatSeconds(timeline.totalSeconds)}</span> total
              </span>
              <span className="text-line-strong">/</span>
              <span className="text-faint">
                Scene {activeIndex + 1} · {formatSeconds(timedScene?.durationSeconds ?? 0)}{" "}
                {timedScene?.measured ? "voiced" : "estimated"}
              </span>
              <span className="ml-auto flex items-center gap-2 text-faint" aria-live="polite">
                {isRendering ? <span className="text-accent">{render.message}</span> : null}
                {!isRendering && render.status === "error" ? (
                  <span className="text-danger">Last render failed</span>
                ) : null}
              </span>
            </div>
          </div>
        </main>

        {/* ------------------------------ inspector ---------------------------- */}
        <aside className="order-3 flex w-full min-h-0 shrink-0 flex-col border-t border-line bg-canvas xl:border-t-0 xl:border-l">
          <div role="tablist" aria-label="Inspector" className="flex shrink-0 items-stretch border-b border-line px-1">
            {PANELS.map((entry) => {
              const active = panel === entry.id;
              return (
                <button
                  key={entry.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPanel(entry.id)}
                  className={cx(
                    "relative flex flex-1 items-center justify-center gap-1.5 py-3 text-[11px] font-medium transition-colors",
                    active ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  <entry.icon className="h-3.5 w-3.5" />
                  {entry.label}
                  {entry.id === "assistant" && aiState === "off" ? (
                    <span className="absolute top-2.5 right-2.5 h-1 w-1 rounded-full bg-faint" />
                  ) : null}
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-[1.5px] rounded-full bg-accent" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3.5">
            {panel === "design" ? renderDesign() : null}
            {panel === "scene" ? renderScene() : null}
            {panel === "audio" ? renderAudio() : null}
            {panel === "assistant" ? renderAssistant() : null}
          </div>
        </aside>
      </div>

      {previewMedia ? (
        <MediaLightbox
          asset={previewMedia}
          url={`/api/assets/${projectId}/${previewMedia.filename}`}
          sceneLabel={scene ? `scene ${activeIndex + 1}` : undefined}
          onUseInScene={
            previewMedia.kind === "image" && scene
              ? () => {
                  updateScene(activeIndex, {
                    imageAssetId: previewMedia.id,
                    imageTreatment: scene.imageTreatment === "none" ? "dim" : scene.imageTreatment,
                  });
                  setPreviewMedia(null);
                }
              : undefined
          }
          onDelete={() => {
            void deleteAsset(previewMedia);
            setPreviewMedia(null);
          }}
          onClose={() => setPreviewMedia(null)}
        />
      ) : null}

      {toast ? <Toast message={toast.text} tone={toast.tone} onClose={() => setToast(null)} /> : null}
    </div>
  );

  /* -------------------------------- panels -------------------------------- */

  function renderDesign() {
    const palette = spec.brand.palette;
    return (
      <>
        <Panel title="Identity">
          <div className="space-y-3">
            <Field label="Title">
              <input
                className={fieldClass}
                value={spec.meta.title}
                onChange={(event) =>
                  setSpec((prev) => ({ ...prev, meta: { ...prev.meta, title: event.target.value.slice(0, 140) } }))
                }
              />
            </Field>
            <Field label="Tone" hint="guides the copy">
              <input
                className={fieldClass}
                value={spec.meta.tone}
                onChange={(event) =>
                  setSpec((prev) => ({ ...prev, meta: { ...prev.meta, tone: event.target.value.slice(0, 80) } }))
                }
              />
            </Field>
            <Field label="Format">
              <div className="grid grid-cols-2 gap-2">
                {(["16:9", "9:16"] as const).map((ratio) => {
                  const active = spec.meta.aspect === ratio;
                  return (
                    <button
                      key={ratio}
                      onClick={() => setSpec((prev) => ({ ...prev, meta: { ...prev.meta, aspect: ratio } }))}
                      className={cx(
                        "flex items-center gap-2 rounded-control border px-2.5 py-2 text-left text-[11px] transition-colors",
                        active
                          ? "border-accent/50 bg-accent/[0.05] text-ink"
                          : "border-line bg-raised text-muted hover:border-line-strong",
                      )}
                    >
                      <span
                        className={cx(
                          "block shrink-0 rounded-[2px] border",
                          ratio === "16:9" ? "h-3.5 w-6" : "h-6 w-3.5",
                          active ? "border-accent/70 bg-accent/10" : "border-line-strong",
                        )}
                      />
                      {ratio === "16:9" ? "Landscape" : "Portrait"}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </Panel>

        {siteHost ? (
          <Panel
            title="Website"
            hint={siteHost}
            action={
              <button
                type="button"
                onClick={refreshSite}
                disabled={siteBusy}
                className="inline-flex items-center gap-1 rounded-[5px] border border-line bg-raised px-1.5 py-1 text-[10px] text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                {siteBusy ? <Spinner className="h-2.5 w-2.5" /> : null}
                Refresh from site
              </button>
            }
          >
            <div className="flex items-start gap-2.5">
              {siteAsset ? (
                <button
                  type="button"
                  onClick={() => setPreviewMedia(siteAsset)}
                  title="Preview screenshot"
                  aria-label="Preview website screenshot"
                  className="h-10 w-16 shrink-0 rounded-[4px] border border-line bg-elevated bg-cover bg-center transition-opacity hover:opacity-80"
                  style={{ backgroundImage: `url(/api/assets/${projectId}/${siteAsset.filename})` }}
                />
              ) : null}
              <div className="min-w-0 text-[11px] leading-relaxed">
                <p className="text-ink-soft">Colours, type and a screenshot were captured from this site.</p>
                <p className="mt-1 text-[10px] text-faint">
                  {FONT_PAIR_META[spec.brand.fontPair].display} · closest bundled pair
                </p>
              </div>
            </div>
          </Panel>
        ) : null}

        <Panel title="Palette">
          <div className="mb-4 grid grid-cols-2 gap-2">
            {Object.entries(PALETTE_PRESETS).map(([name, preset]) => {
              const active = PALETTE_KEYS.every((key) => palette[key].toLowerCase() === preset[key].toLowerCase());
              return (
                <button
                  key={name}
                  onClick={() => setSpec((prev) => ({ ...prev, brand: { ...prev.brand, palette: preset } }))}
                  className={cx(
                    "group overflow-hidden rounded-[7px] border transition-colors",
                    active ? "border-accent/50" : "border-line hover:border-line-strong",
                  )}
                  title={name}
                >
                  <span className="flex h-5">
                    {PALETTE_KEYS.map((key) => (
                      <span key={key} className="flex-1" style={{ backgroundColor: preset[key as PaletteKey] }} />
                    ))}
                  </span>
                  <span
                    className={cx(
                      "flex items-center justify-between px-2 py-1 text-[10px] capitalize",
                      active ? "text-ink" : "text-muted",
                    )}
                  >
                    {name}
                    {active ? <CheckIcon className="h-2.5 w-2.5 text-accent" strokeWidth={2.6} /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            {PALETTE_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-2.5 rounded-[6px] px-1 py-1 hover:bg-raised">
                <input
                  type="color"
                  value={palette[key]}
                  onChange={(event) =>
                    setSpec((prev) => ({
                      ...prev,
                      brand: { ...prev.brand, palette: { ...prev.brand.palette, [key]: event.target.value } },
                    }))
                  }
                  className="h-6 w-6 cursor-pointer rounded-[4px] border border-line bg-transparent"
                  aria-label={`${key} colour`}
                />
                <span className="flex-1 text-[12px] text-ink-soft capitalize">{key}</span>
                <input
                  value={palette[key].toUpperCase()}
                  aria-label={`${key} hex`}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                      setSpec((prev) => ({
                        ...prev,
                        brand: { ...prev.brand, palette: { ...prev.brand.palette, [key]: value } },
                      }));
                    }
                  }}
                  className="timecode w-[78px] rounded-[5px] border border-transparent bg-raised px-2 py-1 text-[10px] text-muted outline-none hover:border-line focus:border-accent/50 focus:text-ink"
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Typography">
          <div className="space-y-2">
            {FONT_PAIRS.map((pair) => {
              const active = spec.brand.fontPair === pair;
              return (
                <button
                  key={pair}
                  onClick={() => setSpec((prev) => ({ ...prev, brand: { ...prev.brand, fontPair: pair } }))}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-control border px-2.5 py-2 text-left transition-colors",
                    active
                      ? "border-accent/50 bg-accent/[0.05]"
                      : "border-line bg-raised hover:border-line-strong",
                  )}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-line/70 bg-elevated text-[15px] text-ink"
                    style={{ fontFamily: FONT_PREVIEW[pair] }}
                  >
                    Aa
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink">{FONT_PAIR_META[pair].name}</span>
                      <span className="truncate text-[10px] text-faint">{FONT_PAIR_META[pair].display}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-faint">
                      {FONT_PAIR_META[pair].note}
                    </span>
                  </span>
                  {active ? <CheckIcon className="h-3 w-3 shrink-0 text-accent" strokeWidth={2.4} /> : null}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Captions">
          <Toggle
            checked={spec.captions.enabled}
            onChange={(value) => setSpec((prev) => ({ ...prev, captions: { enabled: value } }))}
            label="Burn in captions"
            description="Narration is split into short cues timed to the voiceover."
          />
        </Panel>
      </>
    );
  }

  function renderScene() {
    if (!scene) return null;
    const narrationWords = scene.narration.trim() ? scene.narration.trim().split(/\s+/).length : 0;
    const imageAssets = assets.filter((asset) => asset.kind === "image");

    return (
      <>
        <Panel
          title={`Scene ${activeIndex + 1}`}
          hint={LAYOUT_META[scene.layout].label}
          action={
            <span className="timecode text-[10px] text-faint">
              {formatSeconds(timedScene?.durationSeconds ?? 0)}
              {timedScene?.measured ? " voiced" : " est."}
            </span>
          }
        >
          <div className="space-y-3">
            <Field label="Layout">
              <div className="grid grid-cols-3 gap-1.5">
                {LAYOUTS.map((layout) => (
                  <button
                    key={layout}
                    onClick={() => updateScene(activeIndex, { layout })}
                    title={LAYOUT_META[layout].hint}
                    className={cx(
                      "rounded-[6px] border px-1 py-1.5 text-[11px] transition-colors",
                      scene.layout === layout
                        ? "border-accent/50 bg-accent/[0.08] text-ink"
                        : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {LAYOUT_META[layout].label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Heading" hint={`${scene.heading.length}/140`}>
              <textarea
                rows={2}
                className={cx(fieldClass, "resize-none")}
                value={scene.heading}
                onChange={(event) => updateScene(activeIndex, { heading: event.target.value.slice(0, 140) })}
              />
            </Field>

            <Field label="Emphasis" hint="one word">
              <input
                className={fieldClass}
                value={scene.emphasis}
                onChange={(event) => updateScene(activeIndex, { emphasis: event.target.value.slice(0, 60) })}
                placeholder="Optional accent word"
              />
            </Field>

            <Field
              label={scene.layout === "list" ? "List items" : "Body"}
              hint={scene.layout === "list" ? "one per line" : `${scene.body.length}/500`}
            >
              <textarea
                rows={3}
                className={cx(fieldClass, "resize-none")}
                value={scene.body}
                onChange={(event) => updateScene(activeIndex, { body: event.target.value.slice(0, 500) })}
                placeholder={scene.layout === "list" ? "One item per line" : "Supporting copy"}
              />
            </Field>

            <Field label="Narration" hint={`${narrationWords} words`}>
              <textarea
                rows={4}
                className={cx(fieldClass, "resize-none")}
                value={scene.narration}
                onChange={(event) => updateScene(activeIndex, { narration: event.target.value.slice(0, 900) })}
                placeholder="What the voiceover says"
              />
            </Field>
          </div>
        </Panel>

        <Panel
          title="Image"
          hint={imageAssets.length === 0 ? "auto artwork — upload for a photo" : "auto artwork or a photo"}
          action={
            scene.imageAssetId ? (
              <button
                onClick={() => updateScene(activeIndex, { imageAssetId: null })}
                className="text-[10px] text-faint transition-colors hover:text-ink"
              >
                Clear
              </button>
            ) : null
          }
        >
          <div className="grid grid-cols-5 gap-1.5">
            <button
              onClick={() => updateScene(activeIndex, { imageAssetId: null })}
              title="Use generated artwork instead of a photo"
              className={cx(
                "flex aspect-square items-center justify-center rounded-[6px] border text-[10px] transition-colors",
                scene.imageAssetId === null
                  ? "border-accent/50 bg-accent/[0.08] text-ink"
                  : "border-line bg-raised text-faint hover:border-line-strong hover:text-ink",
              )}
            >
              Auto
            </button>
            {imageAssets.map((asset) => (
              <div key={asset.id} className="group relative">
                <button
                  onClick={() => updateScene(activeIndex, { imageAssetId: asset.id })}
                  className={cx(
                    "block w-full overflow-hidden rounded-[6px] border transition-colors",
                    scene.imageAssetId === asset.id
                      ? "border-accent ring-1 ring-accent/30"
                      : "border-line hover:border-line-strong",
                  )}
                  title="Use this image"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${projectId}/${asset.filename}`}
                    alt=""
                    className="aspect-square h-full w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMedia(asset)}
                  aria-label={`Preview ${asset.filename}`}
                  title="Preview image"
                  className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-[9px] text-ink opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ⤢
                </button>
              </div>
            ))}
            <button
              onClick={() => imageInput.current?.click()}
              aria-label="Upload image"
              className="flex aspect-square items-center justify-center rounded-[6px] border border-dashed border-line text-faint transition-colors hover:border-line-strong hover:text-ink"
            >
              {uploading ? <Spinner className="h-3 w-3" /> : <ImageIcon className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Treatment">
              <select
                className={selectClass}
                value={scene.imageTreatment}
                onChange={(event) =>
                  updateScene(activeIndex, {
                    imageTreatment: event.target.value as Scene["imageTreatment"],
                  })
                }
              >
                {IMAGE_TREATMENTS.map((treatment) => (
                  <option key={treatment} value={treatment}>
                    {IMAGE_TREATMENT_LABEL[treatment]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Transition">
              <select
                className={selectClass}
                value={scene.transition}
                onChange={(event) =>
                  updateScene(activeIndex, { transition: event.target.value as Scene["transition"] })
                }
              >
                {TRANSITIONS.map((transition) => (
                  <option key={transition} value={transition}>
                    {transition}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Duration" hint="blank = follow audio">
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={0.5}
                  placeholder="Auto"
                  value={scene.durationSeconds ?? ""}
                  onChange={(event) =>
                    updateScene(activeIndex, {
                      durationSeconds: event.target.value ? Number(event.target.value) : null,
                    })
                  }
                  className={fieldClass}
                />
                <Button
                  variant="secondary"
                  onClick={() => updateScene(activeIndex, { durationSeconds: null })}
                  disabled={scene.durationSeconds === null}
                  className="shrink-0"
                >
                  Auto
                </Button>
              </div>
            </Field>
          </div>
        </Panel>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => duplicateScene(activeIndex)}>
            <CopyIcon className="h-3.5 w-3.5" />
            Duplicate
          </Button>
          <Button variant="danger" className="flex-1" onClick={() => removeScene(activeIndex)}>
            <TrashIcon className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </>
    );
  }

  function renderAudio() {
    return (
      <>
        <Panel title="Voiceover">
          {!speech ? (
            <InlineNotice tone="warn">
              <span className="font-medium text-amber-100/90">No voiceover yet.</span> Narration is timed by
              estimate. Install Edge TTS once and restart the app:{" "}
              <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">pip install edge-tts</code>
            </InlineNotice>
          ) : null}

          <div className={cx("mt-3 space-y-3", !speech && "opacity-50")}>
            <Field label="Voice" hint={speech ? "Edge TTS · free" : "unavailable"}>
              <select
                className={selectClass}
                value={spec.audio.voice}
                disabled={!speech}
                onChange={(event) =>
                  setSpec((prev) => ({
                    ...prev,
                    audio: { ...prev.audio, voice: event.target.value as VideoSpec["audio"]["voice"] },
                  }))
                }
              >
                {VOICES.map((voice) => (
                  <option key={voice} value={voice}>
                    {VOICE_LABELS[voice] ?? voice}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-[11px] leading-relaxed text-muted">
              {speech
                ? "Each scene is recorded on render. The real spoken length sets the scene length, so captions, cuts and music stay in sync."
                : "Narration still drives captions and scene length, using an estimated speaking pace."}
            </p>
          </div>

          <div className="mt-3 rounded-control border border-line bg-raised p-2.5">
            <div className="mb-1.5 text-[10px] tracking-[0.08em] text-faint uppercase">Pacing</div>
            <div className="space-y-1">
              {spec.scenes.map((current, index) => {
                const duration = render.durations[current.id];
                const voiced = Boolean(sceneAudio[current.id]);
                return (
                  <div key={current.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate text-muted">
                      <span className="timecode mr-1.5 text-faint">{String(index + 1).padStart(2, "0")}</span>
                      {current.heading}
                    </span>
                    <span className={cx("timecode shrink-0 text-[10px]", voiced ? "text-success" : "text-faint")}>
                      {voiced && duration ? `${duration.toFixed(1)}s` : "on render"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel title="Sound effects" hint="shared library">
          <Toggle
            checked={spec.audio.sfx}
            onChange={(value) => setSpec((prev) => ({ ...prev, audio: { ...prev.audio, sfx: value } }))}
            label="Transition sounds"
            description="Generated once into a local library, then reused by every video. No licensed audio, no per-render cost."
          />

          <div className={cx("mt-3 space-y-3", !spec.audio.sfx && "pointer-events-none opacity-45")}>
            <Field
              label="Pack"
              hint={
                <button
                  type="button"
                  onClick={() => previewSfx(sfxPack)}
                  className="inline-flex items-center gap-1 text-[10px] text-muted transition-colors hover:text-ink"
                >
                  {previewing === sfxPack ? <Spinner className="h-2.5 w-2.5" /> : <SpeakerIcon className="h-2.5 w-2.5" />}
                  Preview
                </button>
              }
            >
              <div className="grid grid-cols-3 gap-1.5">
                {SFX_PACKS.map((pack) => {
                  const active = (spec.audio.sfxPack ?? "auto") === pack;
                  return (
                    <button
                      key={pack}
                      type="button"
                      onClick={() =>
                        setSpec((prev) => ({ ...prev, audio: { ...prev.audio, sfxPack: pack } }))
                      }
                      title={SFX_PACK_META[pack]?.note}
                      className={cx(
                        "rounded-[6px] border px-2 py-1.5 text-[11px] transition-colors",
                        active
                          ? "border-accent/50 bg-accent/[0.06] text-ink"
                          : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
                      )}
                    >
                      {SFX_PACK_META[pack]?.name ?? pack}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
                {SFX_PACK_META[spec.audio.sfxPack ?? "auto"]?.note}
                {spec.audio.sfxPack === "auto" ? ` Using ${SFX_PACK_META[sfxPack]?.name.toLowerCase()}.` : ""}
              </p>
            </Field>

            <Field label="Volume" hint={`${Math.round(spec.audio.sfxVolume * 100)}%`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={spec.audio.sfxVolume}
                onChange={(event) =>
                  setSpec((prev) => ({
                    ...prev,
                    audio: { ...prev.audio, sfxVolume: Number(event.target.value) },
                  }))
                }
                className="w-full accent-[var(--color-accent)]"
              />
            </Field>

            <p className="text-[10.5px] leading-relaxed text-faint">
              Fade, slide and wipe each have their own sound; transitions set to none stay silent.
            </p>
          </div>
        </Panel>

        <Panel
          title="Music"
          action={
            musicAsset ? (
              <button
                onClick={() => deleteAsset(musicAsset)}
                className="text-[10px] text-faint transition-colors hover:text-danger"
              >
                Remove
              </button>
            ) : null
          }
        >
          {musicAsset ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setPreviewMedia(musicAsset)}
                title="Open music preview"
                className="flex w-full items-center gap-2 rounded-control border border-line bg-raised px-2.5 py-2 text-left transition-colors hover:border-line-strong"
              >
                <MusicIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{musicAsset.filename}</span>
                <span className="timecode text-[10px] text-faint">
                  {Math.round(musicAsset.bytes / 1024)}kb
                </span>
                <PlayIcon className="h-3 w-3 shrink-0 text-faint" />
              </button>
              <Field label="Volume" hint={`${Math.round(spec.audio.musicVolume * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.01}
                  value={spec.audio.musicVolume}
                  onChange={(event) =>
                    setSpec((prev) => ({
                      ...prev,
                      audio: { ...prev.audio, musicVolume: Number(event.target.value) },
                    }))
                  }
                  className="w-full cursor-pointer accent-accent"
                />
              </Field>
            </div>
          ) : (
            <button
              onClick={() => musicInput.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-control border border-dashed border-line px-3 py-5 text-[11px] text-faint transition-colors hover:border-line-strong hover:text-ink"
            >
              {uploading ? <Spinner className="h-3 w-3" /> : <MusicIcon className="h-4 w-4" />}
              Upload a music bed
            </button>
          )}
          <input
            ref={musicInput}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files, "music");
              event.target.value = "";
            }}
          />
        </Panel>
      </>
    );
  }

  function renderAssistant() {
    const offline = aiState === "off";
    return (
      <>
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">Edit with AI</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Describe a change in plain English. The model rewrites the plan, never the template — every
                field stays editable and the last version is kept for undo.
              </p>
            </div>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-accent">
              <SparklesIcon className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-line/70 pt-3">
            <span className={`h-1.5 w-1.5 rounded-full ${offline ? "bg-faint" : "bg-success"}`} />
            <span className="timecode min-w-0 flex-1 truncate text-[10px] text-faint">
              {offline ? "APINEX_API_KEY not set" : model}
            </span>
            <span className="text-[10px] text-faint">free tier</span>
          </div>

          {offline ? (
            <InlineNotice tone="warn" className="mt-3">
              AI editing is off. Add your APInex key to{" "}
              <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">.env</code> and restart.
            </InlineNotice>
          ) : null}
        </div>

        <div className="space-y-2 rounded-card border border-line bg-surface/60 p-3">
          {chat.length === 0 ? (
            <p className="py-6 text-center text-[11px] leading-relaxed text-faint">
              Ask for anything — pacing, tone, a single scene,
              <br />
              or a completely different direction.
            </p>
          ) : (
            chat.map((message, index) => (
              <div
                key={index}
                className={cx(
                  "rise flex gap-2 text-[11.5px] leading-relaxed",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {message.role === "assistant" ? (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-accent">
                    <SparklesIcon className="h-2.5 w-2.5" />
                  </span>
                ) : null}
                <div
                  className={cx(
                    "max-w-[85%] rounded-[8px] px-2.5 py-2",
                    message.role === "user"
                      ? "bg-elevated text-ink"
                      : message.error
                        ? "border border-danger/20 bg-danger/[0.05] text-danger"
                        : "border border-line bg-raised text-ink-soft",
                  )}
                >
                  {message.text}
                </div>
              </div>
            ))
          )}
          {thinking ? (
            <div className="flex items-center gap-2 px-1 py-1 text-[11px] text-muted">
              <Spinner className="h-3 w-3 text-accent" />
              Rewriting the plan…
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_EDITS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => void sendInstruction(prompt)}
              disabled={thinking || offline}
              className="rounded-full border border-line bg-raised px-2.5 py-1 text-[10.5px] text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-40"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="rounded-card border border-line bg-surface p-2">
          <textarea
            rows={2}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value.slice(0, 1200))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendInstruction();
              }
            }}
            placeholder="e.g. make scene 3 calmer and add a pause before the CTA"
            className="w-full resize-none bg-transparent px-1.5 py-1 text-[12px] leading-relaxed text-ink outline-none placeholder:text-faint/80"
          />
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <span className="text-[10px] text-faint">
              <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void sendInstruction()}
              disabled={thinking || !instruction.trim() || offline}
            >
              {thinking ? <Spinner className="h-3 w-3" /> : <SparklesIcon className="h-3 w-3" />}
              Send
            </Button>
          </div>
        </div>

        <p className="px-1 text-[10px] leading-relaxed text-faint">
          {assets.filter((asset) => asset.kind === "image").length} reference image(s) available. Images are
          never re-sent with an edit.
        </p>
      </>
    );
  }
}
