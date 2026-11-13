import { LAYOUTS, normalizeSpec, type VideoSpec } from "../spec";
import { chatJSON, hasAI } from "./client";
import { EDIT_SYSTEM_PROMPT, editUserPrompt } from "./prompts";
import { EDIT_SCHEMA } from "./schema";

type AiEdit = {
  title: string;
  tone: string;
  aspect: string;
  palette: Record<string, string>;
  fontPair: string;
  voice: string;
  sfx: boolean;
  captions: boolean;
  scenes: {
    id: string;
    layout: string;
    heading: string;
    body: string;
    narration: string;
    emphasis: string;
    imageAssetId: string | null;
    imageTreatment: string;
    transition: string;
    durationSeconds: number | null;
  }[];
};

export async function editSpec(options: {
  spec: VideoSpec;
  instruction: string;
  imageAssetIds: string[];
}): Promise<{ spec: VideoSpec; note: string }> {
  if (!hasAI()) {
    throw new Error(
      "AI edits need APINEX_API_KEY in .env. You can still change every field by hand and render without it.",
    );
  }

  const ai = await chatJSON<AiEdit>({
    system: EDIT_SYSTEM_PROMPT,
    user: editUserPrompt({
      spec: options.spec,
      instruction: options.instruction,
      layoutList: LAYOUTS.join(", "),
    }),
    schema: EDIT_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "video_spec_edit",
    temperature: 0.5,
  });

  const validAssets = new Set(options.imageAssetIds);
  const scenes = (ai.scenes ?? []).map((scene) => ({
    ...scene,
    imageAssetId:
      scene.imageAssetId && validAssets.has(scene.imageAssetId) ? scene.imageAssetId : null,
  }));

  const next = normalizeSpec(
    {
      meta: { title: ai.title, aspect: ai.aspect, tone: ai.tone },
      brand: { palette: ai.palette, fontPair: ai.fontPair },
      audio: {
        voice: ai.voice,
        // Music is a local upload, never something the model invents.
        musicAssetId: options.spec.audio.musicAssetId,
        musicVolume: options.spec.audio.musicVolume,
        sfx: ai.sfx,
        sfxPack: options.spec.audio.sfxPack ?? "auto",
        sfxVolume: options.spec.audio.sfxVolume ?? 0.4,
      },
      captions: { enabled: ai.captions !== false },
      scenes,
    },
    options.spec.meta.aspect,
  );

  return { spec: next, note: summarizeChange(options.spec, next) };
}

export function summarizeChange(before: VideoSpec, after: VideoSpec): string {
  const changes: string[] = [];

  if (before.meta.title !== after.meta.title) changes.push(`title → “${after.meta.title}”`);
  if (before.meta.aspect !== after.meta.aspect) changes.push(`now ${after.meta.aspect}`);
  if (before.brand.fontPair !== after.brand.fontPair) changes.push(`type → ${after.brand.fontPair}`);
  if (before.audio.voice !== after.audio.voice) changes.push(`voice → ${after.audio.voice}`);

  const paletteChanged = Object.keys(before.brand.palette).filter(
    (key) => (before.brand.palette as any)[key] !== (after.brand.palette as any)[key],
  ).length;
  if (paletteChanged) changes.push("palette updated");

  if (before.scenes.length !== after.scenes.length) {
    changes.push(`${before.scenes.length} → ${after.scenes.length} scenes`);
  }

  const changedScenes = after.scenes.filter((scene) => {
    const old = before.scenes.find((candidate) => candidate.id === scene.id);
    if (!old) return true;
    return (
      old.heading !== scene.heading ||
      old.body !== scene.body ||
      old.narration !== scene.narration ||
      old.layout !== scene.layout
    );
  }).length;
  if (changedScenes) changes.push(`${changedScenes} scene${changedScenes === 1 ? "" : "s"} rewritten`);

  return changes.length ? changes.join(" · ") : "No visible change — try a more specific instruction.";
}
