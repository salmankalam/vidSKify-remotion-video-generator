import { defaultSpec, type VideoSpec } from "../lib/spec";

/** Transition sound URLs, keyed by the transition that introduces the cut. */
export type SfxMap = Partial<Record<"fade" | "slide" | "wipe", string>>;

/**
 * Everything the composition needs, and nothing it doesn't: no filesystem, no
 * database. Asset ids map to URLs per environment (dev server for the Player,
 * render worker for the MP4).
 */
export type VideoCompositionProps = {
  spec: VideoSpec;
  /** assetId -> absolute or same-origin URL */
  images: Record<string, string>;
  /** sceneId -> voiceover URL */
  sceneAudio: Record<string, string>;
  music: string | null;
  /** Shared library sounds for each transition kind. */
  sfx: SfxMap;
  sfxVolume: number;
  /** Measured voiceover seconds, keyed by scene id. */
  durations: Record<string, number>;
};

export const defaultCompositionProps: VideoCompositionProps = {
  spec: defaultSpec("16:9"),
  images: {},
  sceneAudio: {},
  music: null,
  sfx: {},
  sfxVolume: 0.4,
  durations: {},
};
