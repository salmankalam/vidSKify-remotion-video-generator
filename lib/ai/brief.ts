import { normalizeSpec, newSceneId, type Aspect, type VideoSpec } from "../spec";
import { heuristicSpec } from "./heuristic";
import { BRIEF_SCHEMA } from "./schema";
import { BRIEF_SYSTEM_PROMPT, briefUserPrompt } from "./prompts";
import { chatJSON, hasAI } from "./client";
import type { WebsiteSummary } from "./website";

type AiBriefScene = {
  layout: string;
  heading: string;
  body: string;
  narration: string;
  emphasis: string;
  imageIndex: number | null;
  imageTreatment: string;
  transition: string;
};

type AiBrief = {
  title: string;
  tone: string;
  palette: Record<string, string>;
  fontPair: string;
  voice: string;
  scenes: AiBriefScene[];
};

export type BriefResult = {
  spec: VideoSpec;
  source: "ai" | "heuristic";
  warning?: string;
};

/**
 * The site is the strongest brand signal we have, so its measured colours and
 * type win over the model's guess. The screenshot becomes real scene imagery:
 * a dimmed backdrop on the opener and a photo slot in the first media beat.
 */
export function applySiteLook(
  spec: VideoSpec,
  website: WebsiteSummary | null | undefined,
  screenshotAssetId: string | null | undefined,
) {
  if (website?.palette) spec.brand.palette = website.palette;
  if (website?.fontPair) spec.brand.fontPair = website.fontPair;

  if (!screenshotAssetId) return;
  const free = spec.scenes.filter((scene) => !scene.imageAssetId);
  if (!free.length) return;

  // A website is a UI screenshot: it belongs in a real media panel. Using it as
  // a full-bleed hook backdrop just crops the page into noise, especially 9:16.
  const media = free.filter((scene) => scene.layout === "fullBleed" || scene.layout === "split");
  const targets = media.length ? media.slice(0, 2) : free.slice(0, 1);

  for (const scene of targets) {
    scene.imageAssetId = screenshotAssetId;
    scene.imageTreatment = "dim";
  }
}

export async function specFromBrief(options: {
  brief: string;
  aspect: Aspect;
  images: { assetId: string; dataUrl: string }[];
  website?: WebsiteSummary | null;
  /** The captured screenshot, stored as a project image but not a user image. */
  screenshot?: { assetId: string; dataUrl: string } | null;
}): Promise<BriefResult> {
  const imageAssetIds = options.images.map((image) => image.assetId);

  const fallback = (warning?: string): BriefResult => {
    const spec = heuristicSpec({
      brief: options.brief,
      aspect: options.aspect,
      imageAssetIds,
      websiteTitle: options.website?.title,
    });
    applySiteLook(spec, options.website, options.screenshot?.assetId);
    return {
      spec,
      source: "heuristic",
      warning,
    };
  };

  if (!hasAI()) {
    return fallback(
      "No APINEX_API_KEY set — built a rule-based draft. Add your free APInex key to unlock AI briefs and edits.",
    );
  }

  try {
    const ai = await chatJSON<AiBrief>({
      system: BRIEF_SYSTEM_PROMPT,
      user: briefUserPrompt({
        brief: options.brief,
        aspect: options.aspect,
        imageCount: options.images.length,
        website: options.website ?? null,
      }),
      schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "video_brief",
      images: [...options.images, ...(options.screenshot ? [options.screenshot] : [])]
        .slice(0, 4)
        .map((image) => ({ dataUrl: image.dataUrl })),
    });

    const scenes = (ai.scenes ?? []).slice(0, 12).map((scene) => ({
      id: newSceneId(),
      layout: scene.layout,
      heading: scene.heading,
      body: scene.body,
      narration: scene.narration,
      emphasis: scene.emphasis,
      imageAssetId:
        typeof scene.imageIndex === "number" && imageAssetIds[scene.imageIndex]
          ? imageAssetIds[scene.imageIndex]
          : null,
      imageTreatment: scene.imageTreatment,
      transition: scene.transition,
      durationSeconds: null,
    }));

    const spec = normalizeSpec(
      {
        meta: { title: ai.title, aspect: options.aspect, tone: ai.tone },
        brand: { palette: ai.palette, fontPair: ai.fontPair },
        audio: {
          voice: ai.voice,
          musicAssetId: null,
          musicVolume: 0.18,
          sfx: true,
          sfxPack: "auto",
          sfxVolume: 0.4,
        },
        captions: { enabled: true },
        scenes,
      },
      options.aspect,
    );

    applySiteLook(spec, options.website, options.screenshot?.assetId);

    return { spec, source: "ai" };
  } catch (error: any) {
    return fallback(`${error?.message ?? "The AI request failed"} — showing a rule-based draft instead.`);
  }
}
