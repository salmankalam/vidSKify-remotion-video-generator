import {
  ASPECTS,
  FONT_PAIRS,
  IMAGE_TREATMENTS,
  LAYOUTS,
  TRANSITIONS,
  VOICES,
} from "../spec";

const hex = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } as const;

const palette = {
  type: "object",
  additionalProperties: false,
  required: ["background", "surface", "primary", "accent", "text"],
  properties: {
    background: hex,
    surface: hex,
    primary: hex,
    accent: hex,
    text: hex,
  },
} as const;

/** What the AI returns for a fresh brief: no ids yet, images referenced by index. */
export const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "tone", "palette", "fontPair", "voice", "scenes"],
  properties: {
    title: { type: "string" },
    tone: { type: "string" },
    palette,
    fontPair: { type: "string", enum: [...FONT_PAIRS] },
    voice: { type: "string", enum: [...VOICES] },
    scenes: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "layout",
          "heading",
          "body",
          "narration",
          "emphasis",
          "imageIndex",
          "imageTreatment",
          "transition",
        ],
        properties: {
          layout: { type: "string", enum: [...LAYOUTS] },
          heading: { type: "string", description: "At most 6 words, no ending punctuation." },
          body: {
            type: "string",
            description: "At most 22 words. For layout=list, 2-4 separate items joined by a newline character.",
          },
          narration: { type: "string", description: "14-32 spoken words, read aloud as voiceover." },
          emphasis: { type: "string" },
          imageIndex: { type: ["integer", "null"] },
          imageTreatment: { type: "string", enum: [...IMAGE_TREATMENTS] },
          transition: { type: "string", enum: [...TRANSITIONS] },
        },
      },
    },
  },
} as const;

/** What the AI returns when revising: the whole plan, ids intact. */
export const EDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "tone", "aspect", "palette", "fontPair", "voice", "sfx", "captions", "scenes"],
  properties: {
    title: { type: "string" },
    tone: { type: "string" },
    aspect: { type: "string", enum: [...ASPECTS] },
    palette,
    fontPair: { type: "string", enum: [...FONT_PAIRS] },
    voice: { type: "string", enum: [...VOICES] },
    sfx: { type: "boolean" },
    captions: { type: "boolean" },
    scenes: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "layout",
          "heading",
          "body",
          "narration",
          "emphasis",
          "imageAssetId",
          "imageTreatment",
          "transition",
          "durationSeconds",
        ],
        properties: {
          id: { type: "string" },
          layout: { type: "string", enum: [...LAYOUTS] },
          heading: { type: "string", description: "At most 6 words, no ending punctuation." },
          body: {
            type: "string",
            description: "At most 22 words. For layout=list, 2-4 separate items joined by a newline character.",
          },
          narration: { type: "string", description: "14-32 spoken words, read aloud as voiceover." },
          emphasis: { type: "string" },
          imageAssetId: { type: ["string", "null"] },
          imageTreatment: { type: "string", enum: [...IMAGE_TREATMENTS] },
          transition: { type: "string", enum: [...TRANSITIONS] },
          durationSeconds: { type: ["number", "null"] },
        },
      },
    },
  },
} as const;
