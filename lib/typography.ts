import type { FontPair, Layout } from "./spec";

export const LAYOUT_META: Record<Layout, { label: string; hint: string }> = {
  hook: { label: "Hook", hint: "Big centred opener" },
  split: { label: "Split", hint: "Text beside a photo" },
  fullBleed: { label: "Full bleed", hint: "Photo filling the frame" },
  statement: { label: "Statement", hint: "Type-only big idea" },
  list: { label: "List", hint: "Numbered points from the body" },
  cta: { label: "CTA", hint: "Closing call to action" },
};

export const FONT_PAIR_META: Record<FontPair, { name: string; display: string; body: string; note: string }> = {
  modern: {
    name: "Modern",
    display: "Space Grotesk",
    body: "Inter",
    note: "Tight grotesk headlines, calm body text. Good for product and tech.",
  },
  editorial: {
    name: "Editorial",
    display: "Playfair Display",
    body: "Inter",
    note: "High-contrast serif display. Good for story, food and culture.",
  },
  bold: {
    name: "Bold",
    display: "Anton",
    body: "Inter",
    note: "Condensed poster type. Good for launches and energy.",
  },
};

export const SFX_PACK_META: Record<string, { name: string; note: string }> = {
  auto: { name: "Auto", note: "Matches the tone of the project." },
  soft: { name: "Soft", note: "Airy sweeps for calm, human films." },
  cinematic: { name: "Cinematic", note: "Low, wide whooshes with weight." },
  minimal: { name: "Minimal", note: "Short dry ticks, barely there." },
  playful: { name: "Playful", note: "Rounded pops for social edits." },
};

export const VOICE_LABELS: Record<string, string> = {
  alloy: "Alloy — neutral · Andrew",
  ash: "Ash — grounded · Brian",
  ballad: "Ballad — soft, British · Thomas",
  coral: "Coral — friendly · Ava",
  echo: "Echo — steady · Christopher",
  fable: "Fable — playful, British · Ryan",
  nova: "Nova — warm, bright · Ava",
  onyx: "Onyx — deep, authoritative · Steffan",
  sage: "Sage — calm, British · Sonia",
  shimmer: "Shimmer — light · Emma",
  verse: "Verse — expressive · Jenny",
};
