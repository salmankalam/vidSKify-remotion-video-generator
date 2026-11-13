import { promises as fs } from "node:fs";
import path from "node:path";
import { projectSchema, type Asset, type AssetKind, type Project, type ProjectSummary } from "./types";
import { normalizeSpec, type VideoSpec } from "./spec";
import { computeTimeline } from "./timing";

export const STORAGE_ROOT =
  process.env.FRAME_STORAGE_ROOT ?? path.join(process.cwd(), "storage", "projects");

export function projectDir(id: string) {
  return path.join(STORAGE_ROOT, id);
}
export function assetsDir(id: string) {
  return path.join(projectDir(id), "assets");
}
export function outputDir(id: string) {
  return path.join(projectDir(id), "out");
}
export function projectFile(id: string) {
  return path.join(projectDir(id), "project.json");
}

export function newProjectId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureStorage() {
  await ensureDir(STORAGE_ROOT);
}

function hydrate(raw: unknown): Project {
  const parsed = projectSchema.parse(raw) as Project;
  parsed.spec = normalizeSpec(parsed.spec, parsed.spec?.meta?.aspect ?? "16:9");
  return parsed;
}

export async function listProjects(): Promise<Project[]> {
  await ensureStorage();
  const entries = await fs.readdir(STORAGE_ROOT, { withFileTypes: true });
  const projects: Project[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const project = await getProject(entry.name);
    if (project) projects.push(project);
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | null> {
  if (!isSafeId(id)) return null;
  try {
    const raw = await fs.readFile(projectFile(id), "utf8");
    return hydrate(JSON.parse(raw));
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function createProject(input: {
  id?: string;
  name: string;
  brief: Project["brief"];
  spec: VideoSpec;
  assets?: Asset[];
}): Promise<Project> {
  const id = input.id ?? newProjectId();
  const now = new Date().toISOString();
  const project: Project = {
    id,
    name: input.name.slice(0, 140),
    createdAt: now,
    updatedAt: now,
    brief: input.brief,
    spec: normalizeSpec(input.spec),
    assets: input.assets ?? [],
    revisions: [],
    render: {
      status: "idle",
      progress: 0,
      message: "",
      error: null,
      videoFile: null,
      posterFile: null,
      durations: {},
      audioScript: {},
      audioVoice: "",
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    },
  };
  await ensureDir(assetsDir(id));
  await ensureDir(outputDir(id));
  await saveProject(project);
  return project;
}

/** Atomic JSON write: temp file + rename, so a crash never truncates a project. */
export async function saveProject(project: Project): Promise<Project> {
  const id = project.id;
  await ensureDir(assetsDir(id));
  await ensureDir(outputDir(id));
  project.updatedAt = new Date().toISOString();
  const target = projectFile(id);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(project, null, 2), "utf8");
  await fs.rename(tmp, target);
  return project;
}

export async function updateProject(
  id: string,
  mutate: (project: Project) => void | Promise<void>,
): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;
  await mutate(project);
  return saveProject(project);
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!isSafeId(id)) return false;
  try {
    await fs.rm(projectDir(id), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export function pushRevision(project: Project, label: string) {
  project.revisions.unshift({
    id: `r${Date.now().toString(36)}`,
    label: label.slice(0, 120),
    at: new Date().toISOString(),
    spec: JSON.parse(JSON.stringify(project.spec)),
  });
  project.revisions = project.revisions.slice(0, 30);
}

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
};

export function extensionFor(filename: string, mime: string) {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  if (ext && EXT_MIME[ext]) return ext;
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  return "bin";
}

export function mimeForFilename(filename: string) {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  return EXT_MIME[ext] ?? "application/octet-stream";
}

export async function storeAsset(
  project: Project,
  input: {
    data: Buffer;
    filename: string;
    mime: string;
    kind: AssetKind;
    sceneId?: string;
    origin?: string;
    width?: number;
    height?: number;
  },
): Promise<Asset> {
  const ext = extensionFor(input.filename, input.mime);
  const id = `a${Math.random().toString(36).slice(2, 9)}`;
  const filename = `${id}.${ext}`;
  await ensureDir(assetsDir(project.id));
  await fs.writeFile(path.join(assetsDir(project.id), filename), input.data);
  const asset: Asset = {
    id,
    filename,
    kind: input.kind,
    mime: input.mime || mimeForFilename(filename),
    bytes: input.data.byteLength,
    createdAt: new Date().toISOString(),
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    ...(input.origin ? { origin: input.origin } : {}),
    ...(input.width ? { width: input.width } : {}),
    ...(input.height ? { height: input.height } : {}),
  };
  project.assets.push(asset);
  return asset;
}

export async function removeAsset(project: Project, assetId: string) {
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) return;
  project.assets = project.assets.filter((a) => a.id !== assetId);
  for (const scene of project.spec.scenes) {
    if (scene.imageAssetId === assetId) scene.imageAssetId = null;
  }
  if (project.spec.audio.musicAssetId === assetId) project.spec.audio.musicAssetId = null;
  try {
    await fs.unlink(path.join(assetsDir(project.id), asset.filename));
  } catch {
    /* already gone */
  }
}

export function assetPath(projectId: string, filename: string) {
  // Filenames are generated by us, but never allow traversal.
  const base = path.basename(filename);
  return path.join(assetsDir(projectId), base);
}

export function summarize(project: Project): ProjectSummary {
  const timeline = computeTimeline(project.spec, project.render.durations);
  return {
    id: project.id,
    name: project.spec.meta.title || project.name,
    aspect: project.spec.meta.aspect,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    sceneCount: project.spec.scenes.length,
    durationSeconds: timeline.totalSeconds,
    status: project.render.status,
    posterUrl: project.render.posterFile
      ? `/api/projects/${project.id}/output/${project.render.posterFile}`
      : null,
    videoUrl: project.render.videoFile
      ? `/api/projects/${project.id}/output/${project.render.videoFile}`
      : null,
  };
}

export function isSafeId(id: string) {
  return /^[a-z0-9]{4,40}$/i.test(id);
}

export function isSafeFilename(name: string) {
  return /^[a-zA-Z0-9._-]+$/.test(name) && !name.startsWith(".");
}
