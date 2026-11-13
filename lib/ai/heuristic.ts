import {
  defaultSpec,
  newSceneId,
  paletteForTone,
  type Aspect,
  type Layout,
  type Scene,
  type TransitionKind,
  type VideoSpec,
  type Voice,
} from "../spec";

const STOPWORDS = new Set(
  "a an the and or but if then than that this these those to of in on for with without from by at as is are was were be been being it its it's we you they he she i our your their my me us do does did make makes made get gets got can will just really very more most about into over under up down out off all any each how what when where who why not no yes so such via using use".split(
    " ",
  ),
);

const LAYOUT_RHYTHM: Layout[] = ["split", "statement", "fullBleed", "list", "split", "statement", "fullBleed"];
const TRANSITION_RHYTHM: TransitionKind[] = ["slide", "fade", "wipe", "slide", "fade"];

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function sentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 3) return parts;
  const clauses = clean
    .split(/[,;]|\s+(?:and|but|then|so)\s+/i)
    .map((s) => s.trim())
    .filter((s) => words(s).length >= 3);
  return clauses.length >= 3 ? clauses : parts;
}

function keyPhrase(text: string, max = 5): string {
  const tokens = words(text.replace(/[.,!?;:"""'']/g, ""));
  const kept: string[] = [];
  for (const token of tokens) {
    if (kept.length >= max) break;
    if (STOPWORDS.has(token.toLowerCase()) && kept.length === 0) continue;
    kept.push(token);
  }
  // "... roasted for the" is not a headline: drop trailing glue words.
  while (kept.length > 1 && STOPWORDS.has(kept[kept.length - 1].toLowerCase())) kept.pop();
  const phrase = (kept.length ? kept : tokens.slice(0, max)).join(" ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function trimWords(text: string, max: number): string {
  const list = words(text);
  if (list.length <= max) return text.trim();
  return `${list.slice(0, max).join(" ").replace(/[.,;:]$/, "")}…`;
}

function emphasisFrom(heading: string): string {
  const candidates = words(heading).filter(
    (w) => w.length > 3 && !STOPWORDS.has(w.toLowerCase()) && /^[a-zA-Z]/.test(w),
  );
  if (!candidates.length) return "";
  return candidates.sort((a, b) => b.length - a.length)[0].replace(/[^\p{L}\p{N}-]/gu, "");
}

function pickVoice(tone: string): Voice {
  const t = tone.toLowerCase();
  if (/warm|friendly|cozy|story/.test(t)) return "nova";
  if (/calm|gentle|minimal/.test(t)) return "shimmer";
  if (/bold|dramatic|cinematic/.test(t)) return "onyx";
  if (/playful|fun|energetic/.test(t)) return "fable";
  return "alloy";
}

function pickFont(tone: string): VideoSpec["brand"]["fontPair"] {
  const t = tone.toLowerCase();
  if (/warm|story|editorial|luxury|food|culture/.test(t)) return "editorial";
  if (/bold|energy|launch|sport|music|dramatic/.test(t)) return "bold";
  return "modern";
}

function detectTone(text: string) {
  const t = text.toLowerCase();
  if (/bold|launch|energy|revolution|fast|power|win/.test(t)) return "bold";
  if (/warm|family|care|recipe|handmade|story|slow/.test(t)) return "warm";
  if (/calm|minimal|simple|quiet|focus/.test(t)) return "calm";
  if (/professional|business|team|platform|product|data/.test(t)) return "confident";
  return "confident";
}

/**
 * Deterministic brief → spec used when there is no API key (or the API fails).
 * It is intentionally plain, but it produces a real, editable, renderable video.
 */
export function heuristicSpec(options: {
  brief: string;
  aspect: Aspect;
  imageAssetIds: string[];
  websiteTitle?: string;
}): VideoSpec {
  const base = defaultSpec(options.aspect);
  const brief = options.brief.trim();
  const tone = detectTone(`${brief} ${options.websiteTitle ?? ""}`);
  const beats = sentences(brief);

  if (!beats.length) {
    if (options.websiteTitle && beats.length === 0) {
      beats.push(options.websiteTitle);
    }
    beats.push(
      "This video is built from a short brief and your reference material.",
      "Edit any line of copy, swap the palette and render again in a minute.",
    );
  }

  // A video needs a hook, some middle and a close.
  while (beats.length < 3) {
    beats.push(
      beats.length === 1
        ? "Every detail here is editable, from the words to the colours."
        : "Change what you need, then render the final cut.",
    );
  }

  const selected = beats.slice(0, 8);
  const title = keyPhrase(selected[0], 6) || options.websiteTitle || base.meta.title;

  const scenes: Scene[] = [];
  selected.forEach((beat, index) => {
    const isFirst = index === 0;
    const isLast = index === selected.length - 1;
    let layout: Layout = isFirst ? "hook" : isLast ? "cta" : LAYOUT_RHYTHM[(index - 1) % LAYOUT_RHYTHM.length];
    // Never repeat the layout of the previous scene.
    if (index > 0 && layout === scenes[index - 1]?.layout) {
      layout = layout === "split" ? "statement" : "split";
    }

    let text = beat.replace(/\s+/g, " ").trim();
    if (!/[.!?…]$/.test(text)) text = `${text}.`;

    let heading = keyPhrase(text, isFirst ? 6 : 5);
    if (layout === "cta") heading = "Start here";

    let body = "";
    if (layout === "list") {
      const items = text
        .split(/[,;]|\band\b/i)
        .map((s) => s.trim().replace(/\.$/, ""))
        .filter((s) => words(s).length >= 2 && words(s).length <= 8)
        .slice(0, 3);
      if (items.length >= 2) {
        body = items.join("\n");
      } else {
        // A one-item list is just a duplicated sentence — use type instead.
        layout = "statement";
      }
    } else if (layout === "cta") {
      body = trimWords(text, 18);
    } else if (layout === "split" || layout === "fullBleed") {
      // Never echo the voiceover as on-screen body copy; use a real second
      // clause when the sentence has one.
      const clause = text
        .split(/[,:]/)
        .slice(1)
        .join(", ")
        .trim()
        .replace(/^and\s+/i, "")
        .replace(/[.]$/, "");
      body = clause && words(clause).length <= 18 ? clause : "";
    }

    const imageAssetId = options.imageAssetIds.length
      ? options.imageAssetIds[index % options.imageAssetIds.length]
      : null;
    const useImage = imageAssetId && !["hook", "statement", "cta"].includes(layout);

    scenes.push({
      id: newSceneId(),
      layout,
      heading: heading || "One more thing",
      body,
      narration: trimWords(text, 32),
      emphasis: emphasisFrom(heading),
      imageAssetId: useImage ? imageAssetId : layout === "fullBleed" ? imageAssetId : null,
      imageTreatment: layout === "fullBleed" ? "duotone" : "dim",
      transition: TRANSITION_RHYTHM[index % TRANSITION_RHYTHM.length],
      durationSeconds: null,
    });
  });

  return {
    meta: { title: title.slice(0, 140), aspect: options.aspect, tone },
    brand: { palette: paletteForTone(tone), fontPair: pickFont(tone) },
    audio: {
      voice: pickVoice(tone),
      musicAssetId: null,
      musicVolume: 0.18,
      sfx: true,
      sfxPack: "auto",
      sfxVolume: 0.4,
    },
    captions: { enabled: true },
    scenes,
  };
}
