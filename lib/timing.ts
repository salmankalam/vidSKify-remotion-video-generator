import type { Aspect, Scene, TransitionKind, VideoSpec } from "./spec";

export const FPS = 30;
export const MIN_SCENE_SECONDS = 2;
/** Breath after the narration ends before the next scene starts. */
export const AUDIO_PADDING_SECONDS = 0.55;
export const WORDS_PER_SECOND = 2.6;

export const TRANSITION_FRAMES: Record<TransitionKind, number> = {
  fade: 14,
  slide: 16,
  wipe: 16,
  none: 0,
};

export const ASPECT_DIMENSIONS: Record<Aspect, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

export function estimateNarrationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return MIN_SCENE_SECONDS;
  return Math.max(MIN_SCENE_SECONDS, words / WORDS_PER_SECOND + 0.85);
}

export type TimedScene = {
  scene: Scene;
  /** Absolute start frame inside the composition. */
  from: number;
  durationInFrames: number;
  durationSeconds: number;
  /** Frames this scene overlaps into the next one. */
  transitionInFrames: number;
  /** True when the duration came from measured voiceover audio. */
  measured: boolean;
};

export type Timeline = {
  fps: number;
  width: number;
  height: number;
  scenes: TimedScene[];
  totalInFrames: number;
  totalSeconds: number;
};

function sceneSeconds(scene: Scene, durations: Record<string, number>): { seconds: number; measured: boolean } {
  if (scene.durationSeconds && scene.durationSeconds >= 1) {
    return { seconds: scene.durationSeconds, measured: false };
  }
  const measured = durations[scene.id];
  if (typeof measured === "number" && measured > 0.2) {
    return { seconds: measured + AUDIO_PADDING_SECONDS, measured: true };
  }
  return { seconds: estimateNarrationSeconds(scene.narration), measured: false };
}

/**
 * The single source of truth for frame maths, shared by the browser Player and
 * the render worker so a preview matches the exported MP4 frame for frame.
 * TransitionSeries overlaps scene N into N+1, so the total is a subtraction.
 */
export function computeTimeline(spec: VideoSpec, durations: Record<string, number> = {}): Timeline {
  const { width, height } = ASPECT_DIMENSIONS[spec.meta.aspect];

  const drafts = spec.scenes.map((scene) => {
    const { seconds, measured } = sceneSeconds(scene, durations);
    const durationInFrames = Math.max(Math.round(MIN_SCENE_SECONDS * FPS), Math.round(seconds * FPS));
    return { scene, durationInFrames, durationSeconds: durationInFrames / FPS, measured };
  });

  const scenes: TimedScene[] = drafts.map((draft, index) => {
    const next = drafts[index + 1];
    const wanted = next ? TRANSITION_FRAMES[next.scene.transition] : 0;
    const overlap = next
      ? Math.max(0, Math.min(wanted, Math.floor(Math.min(draft.durationInFrames, next.durationInFrames) / 3)))
      : 0;
    const from = index === 0 ? 0 : 0;
    return {
      scene: draft.scene,
      from,
      durationInFrames: draft.durationInFrames,
      durationSeconds: draft.durationSeconds,
      transitionInFrames: overlap,
      measured: draft.measured,
    };
  });

  // TransitionSeries overlaps scene N into N+1, so the cursor advances by the
  // scene length minus the overlap it consumes. `from` must include that or a
  // seek to scene 4 would land late by the sum of all earlier transitions.
  let cursor = 0;
  scenes.forEach((s) => {
    s.from = cursor;
    cursor += s.durationInFrames - s.transitionInFrames;
  });

  const totalInFrames = Math.max(FPS, cursor);

  return {
    fps: FPS,
    width,
    height,
    scenes,
    totalInFrames,
    totalSeconds: totalInFrames / FPS,
  };
}

export function formatSeconds(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function frameToSeconds(frame: number) {
  return frame / FPS;
}

const CUE_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "at", "by", "with",
  "from", "as", "is", "are", "was", "were", "that", "this", "your", "our", "my", "their",
  "it", "its", "you", "we", "i", "they", "he", "she", "so", "if", "than", "then", "into", "about",
]);

/**
 * Caption chunks that read like subtitles: break at sentences first, keep
 * chunks around eight words, and never end a cue on a dangling connector
 * ("...learn the" is the classic tell of naive word-count chunking).
 */
function cueChunks(words: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) chunks.push(current);
    current = [];
  };

  for (const word of words) {
    current.push(word);
    const endsSentence = /[.!?]["')\]]?$/.test(word);
    if (endsSentence && current.length >= 3) {
      flush();
      continue;
    }
    if (current.length >= 8) {
      const last = current[current.length - 1].toLowerCase().replace(/[^a-z]/g, "");
      if (CUE_STOPWORDS.has(last) && current.length < 12) continue;
      flush();
    }
  }
  flush();

  if (chunks.length > 1) {
    const tail = chunks[chunks.length - 1];
    if (tail.length <= 2) chunks[chunks.length - 2].push(...chunks.pop()!);
  }
  return chunks;
}

/** Cue timing is weighted by word count, so longer lines hold the screen longer. */
export function captionCues(scene: Scene, durationInFrames: number): { text: string; from: number; duration: number }[] {
  const words = scene.narration.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const chunks = cueChunks(words);
  const speechFrames = Math.max(1, durationInFrames - Math.round(AUDIO_PADDING_SECONDS * FPS) - 4);
  const totalWords = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

  let cursor = 0;
  return chunks.map((chunk, index) => {
    const from = Math.round((cursor / totalWords) * speechFrames);
    cursor += chunk.length;
    const end = index === chunks.length - 1 ? speechFrames : Math.round((cursor / totalWords) * speechFrames);
    return { text: chunk.join(" "), from, duration: Math.max(1, end - from) };
  });
}
