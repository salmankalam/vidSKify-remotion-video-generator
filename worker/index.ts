import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import {
  ensureBrowser,
  makeCancelSignal,
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { bundle } from "@remotion/bundler";
import {
  assetPath,
  getProject,
  isSafeFilename,
  isSafeId,
  outputDir,
  saveProject,
  storeAsset,
} from "../lib/store";
import { hasSpeech, synthesizeSpeech } from "../lib/ai/speech";
import { captureWebsite } from "../lib/ai/site-capture";
import { ensureSfxLibrary, sfxFilename, sfxFilePath } from "../lib/sfx-library";
import { resolveSfxPack, SFX_PACKS } from "../lib/spec";
import type { Project } from "../lib/types";
import type { SfxMap, VideoCompositionProps } from "../remotion/types";

const PORT = Number(process.env.RENDER_WORKER_PORT || 4321);
const BASE_URL = process.env.RENDER_WORKER_URL || `http://127.0.0.1:${PORT}`;
const CACHE_DIR = path.join(process.cwd(), ".remotion-cache");

const app = express();
app.use(express.json({ limit: "2mb" }));

let serveUrl: string | null = null;
let bundlePromise: Promise<string> | null = null;
let browserReady = false;
/** True once the shared SFX library exists on disk; legacy projects fall back. */
let sfxLibraryReady = false;

async function getBundle(): Promise<string> {
  if (serveUrl) return serveUrl;
  if (bundlePromise) return bundlePromise;
  bundlePromise = (async () => {
    const started = Date.now();
    console.log("[worker] bundling Remotion project...");
    const url = await bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
      outDir: path.join(CACHE_DIR, "bundle"),
      onProgress: (progress) => {
        if (progress % 25 === 0) console.log(`[worker] bundling ${progress}%`);
      },
    });
    serveUrl = url;
    console.log(`[worker] bundled in ${Math.round((Date.now() - started) / 1000)}s`);
    return url;
  })();
  try {
    return await bundlePromise;
  } catch (error) {
    bundlePromise = null;
    throw error;
  }
}

async function warmUp() {
  try {
    await ensureBrowser();
    browserReady = true;
    console.log("[worker] Chrome Headless Shell ready");
  } catch (error: any) {
    console.error("[worker] Chrome Headless Shell unavailable:", error?.message ?? error);
  }
  try {
    await getBundle();
  } catch (error: any) {
    console.error("[worker] initial bundle failed:", error?.message ?? error);
  }
  try {
    await ensureSfxLibrary();
    sfxLibraryReady = true;
    console.log("[worker] shared SFX library ready");
  } catch (error: any) {
    console.error("[worker] SFX library unavailable:", error?.message ?? error);
  }
}

/* ------------------------------ asset server ----------------------------- */

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    bundled: Boolean(serveUrl),
    browserReady,
    speech: hasSpeech(),
    active: activeJob,
  });
});

app.get("/assets/:projectId/:file", (req, res) => {
  const { projectId, file } = req.params;
  if (!isSafeId(projectId) || !isSafeFilename(file)) {
    res.status(400).end();
    return;
  }
  res.sendFile(assetPath(projectId, file), (error) => {
    if (error) res.status(404).end();
  });
});

/** Shared, pre-generated transition sounds — the same files for every video. */
app.get("/sfx/:file", async (req, res) => {
  const file = sfxFilePath(req.params.file);
  if (!file) {
    res.status(400).end();
    return;
  }
  try {
    await ensureSfxLibrary();
    sfxLibraryReady = true;
  } catch {
    /* fall through to sendFile's 404 */
  }
  res.sendFile(file, { headers: { "cache-control": "public, max-age=31536000, immutable" } }, (error) => {
    if (error) res.status(404).end();
  });
});

/**
 * Website capture for the brief flow: renders the page in the same headless
 * Chrome the renderer uses, then returns copy, colours, type and a screenshot.
 */
app.post("/capture", async (req, res) => {
  const url = String(req.body?.url ?? "").trim().slice(0, 500);
  if (!url) {
    res.status(400).json({ error: "A URL is required." });
    return;
  }
  try {
    const capture = await captureWebsite(url, {
      refresh: Boolean(req.body?.refresh),
      aspect: req.body?.aspect === "9:16" ? "9:16" : "16:9",
    });
    const { screenshot, ...meta } = capture;
    res.json({ ...meta, screenshot: screenshot.toString("base64") });
  } catch (error: any) {
    res.status(422).json({ error: String(error?.message ?? error).slice(0, 300) });
  }
});

/* -------------------------------- render --------------------------------- */

type Job = { projectId: string; cancel: () => void };
let activeJob: string | null = null;
let activeCancel: (() => void) | null = null;
const queue: string[] = [];
const pending = new Set<string>();

function enqueue(projectId: string): { queued: boolean; reason?: string } {
  if (activeJob === projectId || pending.has(projectId)) {
    return { queued: false, reason: "This video is already rendering." };
  }
  pending.add(projectId);
  queue.push(projectId);
  void pump();
  return { queued: true };
}

async function pump() {
  if (activeJob) return;
  const projectId = queue.shift();
  if (!projectId) return;
  pending.delete(projectId);

  const { cancelSignal, cancel } = makeCancelSignal();
  activeJob = projectId;
  activeCancel = cancel;

  try {
    await renderProject(projectId, cancelSignal);
  } catch (error: any) {
    console.error(`[worker] render failed for ${projectId}:`, error);
    const cancelled = /cancel/i.test(String(error?.message ?? ""));
    await patchProject(projectId, (project) => {
      project.render.status = cancelled ? "idle" : "error";
      project.render.error = cancelled ? null : String(error?.message ?? error).slice(0, 600);
      project.render.message = cancelled ? "Cancelled" : "Render failed";
      project.render.progress = 0;
      project.render.finishedAt = new Date().toISOString();
    });
  } finally {
    activeJob = null;
    activeCancel = null;
    void pump();
  }
}

let saveChain: Promise<unknown> = Promise.resolve();
function persist(project: Project) {
  saveChain = saveChain.then(() => saveProject(project)).catch((error) => {
    console.error("[worker] could not save project:", error);
  });
  return saveChain;
}

async function patchProject(projectId: string, mutate: (project: Project) => void, save = true) {
  const project = await getProject(projectId);
  if (!project) return null;
  mutate(project);
  if (save) await persist(project);
  return project;
}

function buildProps(project: Project): VideoCompositionProps {
  const images: Record<string, string> = {};
  const sceneAudio: Record<string, string> = {};

  const audioFor = (sceneId: string, narration: string) => {
    const candidates = project.assets
      .filter(
        (asset) =>
          asset.kind === "audio" &&
          asset.sceneId === sceneId &&
          project.render.audioScript[sceneId] === narration,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return candidates[0];
  };

  for (const asset of project.assets) {
    if (asset.kind === "image") {
      images[asset.id] = `${BASE_URL}/assets/${project.id}/${asset.filename}`;
    }
  }
  for (const scene of project.spec.scenes) {
    const asset = audioFor(scene.id, scene.narration.trim());
    if (asset) sceneAudio[scene.id] = `${BASE_URL}/assets/${project.id}/${asset.filename}`;
  }

  const music = project.spec.audio.musicAssetId
    ? project.assets.find((asset) => asset.id === project.spec.audio.musicAssetId && asset.kind === "music")
    : null;

  // Shared library sounds, chosen by pack once — never regenerated per project.
  const sfx: SfxMap = {};
  if (project.spec.audio.sfx) {
    if (sfxLibraryReady) {
      const pack = resolveSfxPack(project.spec.audio.sfxPack ?? "auto", project.spec.meta.tone);
      for (const transition of ["fade", "slide", "wipe"] as const) {
        sfx[transition] = `${BASE_URL}/sfx/${sfxFilename(pack, transition)}`;
      }
    } else {
      // Fallback only: older projects may still carry a generated whoosh asset.
      const legacy = project.assets.find((asset) => asset.kind === "sfx");
      if (legacy) {
        const url = `${BASE_URL}/assets/${project.id}/${legacy.filename}`;
        sfx.fade = url;
        sfx.slide = url;
        sfx.wipe = url;
      }
    }
  }

  return {
    spec: project.spec,
    images,
    sceneAudio,
    music: music ? `${BASE_URL}/assets/${project.id}/${music.filename}` : null,
    sfx,
    sfxVolume: project.spec.audio.sfxVolume ?? 0.4,
    durations: project.render.durations,
  };
}

async function prepareAudio(project: Project, progress: (message: string, value: number) => void) {
  const durations = { ...project.render.durations };
  const audioScript = { ...project.render.audioScript };
  const voice = project.spec.audio.voice;
  const total = Math.max(1, project.spec.scenes.length);
  // A different voice invalidates every cached clip, since the text is unchanged.
  const voiceChanged = project.render.audioVoice !== voice;

  for (const [index, scene] of project.spec.scenes.entries()) {
    const narration = scene.narration.trim();
    if (!narration) {
      delete durations[scene.id];
      delete audioScript[scene.id];
      continue;
    }
    const cached =
      !voiceChanged &&
      project.assets.some(
        (asset) =>
          asset.kind === "audio" &&
          asset.sceneId === scene.id &&
          audioScript[scene.id] === narration &&
          durations[scene.id],
      );
    if (cached) continue;
    if (!hasSpeech()) {
      delete durations[scene.id];
      delete audioScript[scene.id];
      progress("No speech model — pacing scenes from the script", (index + 1) / total);
      continue;
    }

    progress(`Recording voiceover ${index + 1}/${total}`, index / total);
    const clip = await synthesizeSpeech({
      text: narration,
      voice,
      tone: project.spec.meta.tone,
    });

    project.assets = project.assets.filter(
      (asset) => !(asset.kind === "audio" && asset.sceneId === scene.id),
    );
    await storeAsset(project, {
      data: clip.data,
      filename: `${scene.id}.mp3`,
      mime: clip.mime,
      kind: "audio",
      sceneId: scene.id,
    });
    const seconds = clip.seconds;
    durations[scene.id] = Math.round(seconds * 100) / 100;
    audioScript[scene.id] = narration;
  }

  // Drop cached audio for scenes that were deleted.
  const liveIds = new Set(project.spec.scenes.map((scene) => scene.id));
  for (const key of Object.keys(durations)) if (!liveIds.has(key)) delete durations[key];
  for (const key of Object.keys(audioScript)) if (!liveIds.has(key)) delete audioScript[key];
  project.assets = project.assets.filter(
    (asset) => asset.kind !== "audio" || (asset.sceneId && liveIds.has(asset.sceneId)),
  );

  project.render.durations = durations;
  project.render.audioScript = audioScript;
  project.render.audioVoice = voice;
}

async function renderProject(projectId: string, cancelSignal: ReturnType<typeof makeCancelSignal>["cancelSignal"]) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");

  const startedAt = new Date().toISOString();
  project.render.status = "preparing";
  project.render.progress = 0.01;
  project.render.message = "Preparing project";
  project.render.error = null;
  project.render.videoFile = null;
  project.render.posterFile = null;
  project.render.finishedAt = null;
  await persist(project);

  await prepareAudio(project, (message, value) => {
    project.render.message = message;
    project.render.progress = 0.02 + Math.min(0.13, value * 0.13);
    void persist(project);
  });

  project.render.status = "rendering";
  project.render.message = "Bundling template";
  project.render.progress = 0.16;
  await persist(project);

  const url = await getBundle();
  try {
    await ensureSfxLibrary();
    sfxLibraryReady = true;
  } catch (error: any) {
    console.error("[worker] SFX library unavailable:", error?.message ?? error);
  }
  const props = buildProps(project);

  project.render.message = "Measuring timeline";
  await persist(project);

  const composition = await selectComposition({ serveUrl: url, id: "Video", inputProps: props });

  const outDir = outputDir(project.id);
  await fs.mkdir(outDir, { recursive: true });
  const videoPath = path.join(outDir, "video.mp4");
  const posterPath = path.join(outDir, "poster.jpg");
  await fs.rm(videoPath, { force: true });
  await fs.rm(posterPath, { force: true });

  let lastSave = 0;
  project.render.message = "Rendering frames";
  await persist(project);

  await renderMedia({
    composition,
    serveUrl: url,
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
    jpegQuality: 92,
    crf: 20,
    audioCodec: "aac",
    outputLocation: videoPath,
    inputProps: props,
    cancelSignal,
    timeoutInMilliseconds: 300_000,
    onProgress: ({ progress }) => {
      const now = Date.now();
      if (now - lastSave < 500) return;
      lastSave = now;
      project.render.progress = 0.18 + Math.min(0.78, progress * 0.78);
      project.render.message = `Rendering ${Math.round(progress * 100)}%`;
      void persist(project);
    },
  });

  project.render.progress = 0.97;
  project.render.message = "Rendering poster";
  await persist(project);

  await renderStill({
    composition,
    serveUrl: url,
    output: posterPath,
    frame: Math.min(24, Math.max(0, composition.durationInFrames - 1)),
    imageFormat: "jpeg",
    jpegQuality: 88,
    inputProps: props,
    timeoutInMilliseconds: 120_000,
  });

  project.render.status = "done";
  project.render.progress = 1;
  project.render.message = "Ready";
  project.render.videoFile = "video.mp4";
  project.render.posterFile = "poster.jpg";
  project.render.finishedAt = new Date().toISOString();
  project.render.startedAt = startedAt;
  await persist(project);
  console.log(`[worker] render complete for ${projectId}`);
}

app.post("/render/:projectId", async (req, res) => {
  const { projectId } = req.params;
  if (!isSafeId(projectId)) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const project = await getProject(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  await patchProject(projectId, (next) => {
    next.render.status = "queued";
    next.render.message = "Queued";
    next.render.progress = 0;
    next.render.error = null;
  });

  const result = enqueue(projectId);
  res.json(result);
});

app.post("/render/:projectId/cancel", (req, res) => {
  const { projectId } = req.params;
  if (activeJob === projectId && activeCancel) {
    activeCancel();
    res.json({ cancelled: true });
    return;
  }
  const index = queue.indexOf(projectId);
  if (index >= 0) {
    queue.splice(index, 1);
    pending.delete(projectId);
    void patchProject(projectId, (project) => {
      project.render.status = "idle";
      project.render.message = "Cancelled";
      project.render.progress = 0;
    });
    res.json({ cancelled: true });
    return;
  }
  res.json({ cancelled: false });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[worker] vidSkify render worker on ${BASE_URL}`);
  void warmUp();
});
