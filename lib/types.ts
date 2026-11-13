import { z } from "zod";

export const ASSET_KINDS = ["image", "audio", "music", "sfx"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const assetSchema = z.object({
  id: z.string(),
  filename: z.string(),
  kind: z.enum(ASSET_KINDS),
  mime: z.string(),
  bytes: z.number().nonnegative(),
  createdAt: z.string(),
  /** Voiceover clips are bound to a scene. */
  sceneId: z.string().optional(),
  /** Where the file came from, e.g. "site" for a captured website screenshot. */
  origin: z.string().max(32).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export type Asset = z.infer<typeof assetSchema>;

export const renderStateSchema = z.object({
  status: z.enum(["idle", "queued", "preparing", "rendering", "done", "error"]),
  progress: z.number().min(0).max(1),
  message: z.string().default(""),
  error: z.string().nullable().default(null),
  videoFile: z.string().nullable().default(null),
  posterFile: z.string().nullable().default(null),
  /** Measured voiceover length in seconds, keyed by scene id. */
  durations: z.record(z.string(), z.number()).default({}),
  /** The narration text each cached clip was generated from. */
  audioScript: z.record(z.string(), z.string()).default({}),
  /** Voice id the cached clips were recorded with. */
  audioVoice: z.string().default(""),
  updatedAt: z.string(),
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
});

export type RenderState = z.infer<typeof renderStateSchema>;

export const revisionSchema = z.object({
  id: z.string(),
  label: z.string(),
  at: z.string(),
  spec: z.any(),
});
export type Revision = z.infer<typeof revisionSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  brief: z.object({
    text: z.string().default(""),
    url: z.string().default(""),
    notes: z.string().default(""),
  }),
  spec: z.any(),
  assets: z.array(assetSchema).default([]),
  revisions: z.array(revisionSchema).default([]),
  render: renderStateSchema,
});

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  brief: { text: string; url: string; notes: string };
  spec: import("./spec").VideoSpec;
  assets: Asset[];
  revisions: Revision[];
  render: RenderState;
};

export type ProjectSummary = {
  id: string;
  name: string;
  aspect: import("./spec").Aspect;
  updatedAt: string;
  createdAt: string;
  sceneCount: number;
  durationSeconds: number;
  status: RenderState["status"];
  posterUrl: string | null;
  videoUrl: string | null;
};

export const blankRenderState = (): RenderState => ({
  status: "idle",
  progress: 0,
  message: "",
  error: null,
  videoFile: null,
  posterFile: null,
  durations: {},
  audioScript: {},
  audioVoice: "",
  updatedAt: new Date().toISOString(),
  startedAt: null,
  finishedAt: null,
});
