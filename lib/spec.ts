import { z } from "zod";

export const ASPECTS = ["16:9", "9:16"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const LAYOUTS = ["hook", "split", "fullBleed", "statement", "list", "cta"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const TRANSITIONS = ["fade", "slide", "wipe", "none"] as const;
export type TransitionKind = (typeof TRANSITIONS)[number];

export const IMAGE_TREATMENTS = ["none", "dim", "duotone", "blur"] as const;
export type ImageTreatment = (typeof IMAGE_TREATMENTS)[number];

export const FONT_PAIRS = ["modern", "editorial", "bold"] as const;
export type FontPair = (typeof FONT_PAIRS)[number];

export const VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
] as const;
export type Voice = (typeof VOICES)[number];

export const SFX_PACKS = ["auto", "soft", "cinematic", "minimal", "playful"] as const;
export type SfxPack = (typeof SFX_PACKS)[number];

/** Concrete packs live in the shared library; "auto" resolves from the tone. */
export const CONCRETE_SFX_PACKS = ["soft", "cinematic", "minimal", "playful"] as const;
export type ConcreteSfxPack = (typeof CONCRETE_SFX_PACKS)[number];

export function resolveSfxPack(pack: SfxPack, tone: string): ConcreteSfxPack {
  if (pack !== "auto") return pack;
  const t = tone.toLowerCase();
  if (/playful|fun|energetic|upbeat|bright|social/.test(t)) return "playful";
  if (/calm|minimal|quiet|gentle|reflective|soft/.test(t)) return "minimal";
  if (/bold|dramatic|cinematic|launch|epic/.test(t)) return "cinematic";
  return "soft";
}

export const PALETTE_KEYS = ["background", "surface", "primary", "accent", "text"] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #101014");

export const paletteSchema = z.object({
  background: hex,
  surface: hex,
  primary: hex,
  accent: hex,
  text: hex,
});

export const sceneSchema = z.object({
  id: z.string().min(1).max(48),
  layout: z.enum(LAYOUTS),
  heading: z.string().min(1).max(140),
  body: z.string().max(500),
  narration: z.string().max(900),
  emphasis: z.string().max(60),
  imageAssetId: z.string().max(64).nullable(),
  imageTreatment: z.enum(IMAGE_TREATMENTS),
  transition: z.enum(TRANSITIONS),
  durationSeconds: z.number().min(1).max(60).nullable(),
});

export const specSchema = z.object({
  meta: z.object({
    title: z.string().min(1).max(140),
    aspect: z.enum(ASPECTS),
    tone: z.string().max(80),
  }),
  brand: z.object({
    palette: paletteSchema,
    fontPair: z.enum(FONT_PAIRS),
  }),
  audio: z.object({
    voice: z.enum(VOICES),
    musicAssetId: z.string().max(64).nullable(),
    musicVolume: z.number().min(0).max(1),
    sfx: z.boolean(),
    sfxPack: z.enum(SFX_PACKS),
    sfxVolume: z.number().min(0).max(1),
  }),
  captions: z.object({ enabled: z.boolean() }),
  scenes: z.array(sceneSchema).min(1).max(12),
});

export type VideoSpec = z.infer<typeof specSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Palette = z.infer<typeof paletteSchema>;

export const MAX_SCENES = 12;

/** Palette presets used by the no-key fallback and the "reset design" button. */
export const PALETTE_PRESETS: Record<string, Palette> = {
  midnight: {
    background: "#0B0B10",
    surface: "#17171F",
    primary: "#F6F4EF",
    accent: "#C8F751",
    text: "#A9A9B6",
  },
  editorial: {
    background: "#12100D",
    surface: "#221E18",
    primary: "#FBF5E9",
    accent: "#E8B25A",
    text: "#B6AC9C",
  },
  studio: {
    background: "#F4F1EA",
    surface: "#E6E1D6",
    primary: "#14130F",
    accent: "#3D5AFE",
    text: "#5C594F",
  },
  ember: {
    background: "#140B0B",
    surface: "#241313",
    primary: "#FFF3EC",
    accent: "#FF6B4A",
    text: "#C4A79D",
  },
};

export function paletteForTone(tone: string): Palette {
  const t = tone.toLowerCase();
  if (/(warm|cozy|food|lifestyle|artisan|story)/.test(t)) return PALETTE_PRESETS.editorial;
  if (/(clean|minimal|bright|corporate|product|saas|light)/.test(t)) return PALETTE_PRESETS.studio;
  if (/(bold|energetic|launch|sport|music|dramatic)/.test(t)) return PALETTE_PRESETS.ember;
  return PALETTE_PRESETS.midnight;
}

export function newSceneId() {
  return `s${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyScene(layout: Layout = "split"): Scene {
  return {
    id: newSceneId(),
    layout,
    heading: "A new beat",
    body: "Add the line that supports this beat.",
    narration: "Add the voiceover for this scene.",
    emphasis: "",
    imageAssetId: null,
    imageTreatment: "dim",
    transition: "fade",
    durationSeconds: null,
  };
}

export function defaultSpec(aspect: Aspect = "16:9"): VideoSpec {
  return {
    meta: { title: "Untitled video", aspect, tone: "confident" },
    brand: { palette: PALETTE_PRESETS.midnight, fontPair: "modern" },
    audio: {
      voice: "alloy",
      musicAssetId: null,
      musicVolume: 0.18,
      sfx: true,
      sfxPack: "auto",
      sfxVolume: 0.4,
    },
    captions: { enabled: true },
    scenes: [
      {
        ...emptyScene("hook"),
        heading: "Your story starts here",
        body: "Describe your vision and the first pass appears in seconds.",
        narration: "Every great video starts with a single idea. Let's turn yours into motion.",
        emphasis: "starts",
      },
    ],
  };
}

/**
 * Defensive normalisation for anything that came from an LLM or from disk:
 * fills gaps, clamps lengths, and makes scene ids unique.
 */
export function normalizeSpec(input: unknown, fallbackAspect: Aspect = "16:9"): VideoSpec {
  const base = defaultSpec(fallbackAspect);
  const raw = (input ?? {}) as Record<string, any>;
  const meta = (raw.meta ?? {}) as Record<string, any>;
  const brand = (raw.brand ?? {}) as Record<string, any>;
  const palette = { ...base.brand.palette, ...(brand.palette ?? {}) };
  for (const key of PALETTE_KEYS) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(palette[key]))) {
      palette[key] = base.brand.palette[key];
    }
  }
  const audio = (raw.audio ?? {}) as Record<string, any>;
  const scenesRaw = Array.isArray(raw.scenes) ? raw.scenes : [];
  const seen = new Set<string>();
  const scenes: Scene[] = scenesRaw.slice(0, MAX_SCENES).map((s: any) => {
    let id = typeof s?.id === "string" && s.id.trim() ? s.id.trim().slice(0, 48) : newSceneId();
    while (seen.has(id)) id = newSceneId();
    seen.add(id);
    const layout = LAYOUTS.includes(s?.layout) ? s.layout : "split";
    // Body keeps line breaks: a "list" scene is one item per line.
    let body = clampMultiline(s?.body, 500);
    if (layout === "list") body = splitListItems(body);
    return {
      id,
      layout,
      heading: clampText(s?.heading, 140) || "Untitled beat",
      body,
      narration: clampText(s?.narration, 900),
      emphasis: clampText(s?.emphasis, 60),
      imageAssetId:
        typeof s?.imageAssetId === "string" && s.imageAssetId.trim()
          ? s.imageAssetId.trim().slice(0, 64)
          : null,
      imageTreatment: IMAGE_TREATMENTS.includes(s?.imageTreatment) ? s.imageTreatment : "dim",
      transition: TRANSITIONS.includes(s?.transition) ? s.transition : "fade",
      durationSeconds:
        typeof s?.durationSeconds === "number" && s.durationSeconds >= 1 && s.durationSeconds <= 60
          ? Math.round(s.durationSeconds * 10) / 10
          : null,
    };
  });

  return {
    meta: {
      title: clampText(meta.title, 140) || base.meta.title,
      aspect: ASPECTS.includes(meta.aspect) ? meta.aspect : fallbackAspect,
      tone: clampText(meta.tone, 80) || base.meta.tone,
    },
    brand: {
      palette,
      fontPair: FONT_PAIRS.includes(brand.fontPair) ? brand.fontPair : "modern",
    },
    audio: {
      voice: VOICES.includes(audio.voice) ? audio.voice : "alloy",
      musicAssetId:
        typeof audio.musicAssetId === "string" && audio.musicAssetId.trim()
          ? audio.musicAssetId.trim().slice(0, 64)
          : null,
      musicVolume:
        typeof audio.musicVolume === "number"
          ? Math.min(0.8, Math.max(0, Math.round(audio.musicVolume * 100) / 100))
          : base.audio.musicVolume,
      sfx: typeof audio.sfx === "boolean" ? audio.sfx : true,
      sfxPack: SFX_PACKS.includes(audio.sfxPack) ? audio.sfxPack : "auto",
      sfxVolume:
        typeof audio.sfxVolume === "number"
          ? Math.min(1, Math.max(0, Math.round(audio.sfxVolume * 100) / 100))
          : base.audio.sfxVolume,
    },
    captions: { enabled: raw.captions?.enabled !== false },
    scenes: scenes.length ? scenes : base.scenes,
  };
}

/** Models sometimes flatten "item · item" lists into one line; recover items. */
function splitListItems(body: string): string {
  if (body.includes("\n")) return body;
  const parts = body
    .split(/(?<=[a-z0-9])\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 3 ? parts.join("\n") : body;
}

export function clampMultiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, max);
}

export function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}
