/**
 * Local sound design. Every effect is synthesised deterministically (no samples,
 * no licences, no network) and peak-normalised, so the library can be built once
 * and reused by every video instead of being re-rendered per project.
 */

export const CONCRETE_SFX_PACKS = ["soft", "cinematic", "minimal", "playful"] as const;
export type ConcreteSfxPack = (typeof CONCRETE_SFX_PACKS)[number];

export const SFX_TRANSITIONS = ["fade", "slide", "wipe"] as const;
export type SfxTransition = (typeof SFX_TRANSITIONS)[number];

export const SFX_SAMPLE_RATE = 44100;
/** Peak target: -3 dBFS leaves headroom for the voiceover mix. */
const PEAK = 0.7079;

type Recipe = {
  /** seconds */
  duration: number;
  /** 0-1 amount of filtered noise in the body */
  noise: number;
  /** low-pass cutoff sweep, Hz */
  cutoffFrom: number;
  cutoffTo: number;
  /** body sine sweep, Hz */
  toneFrom: number;
  toneTo: number;
  /** 0-1 amplitude of the sine relative to the noise bed */
  tone: number;
  /** 0-1 position of the amplitude peak (bigger = slower swell) */
  attack: number;
  /** adds a short transient at the head, for percussive packs */
  transient?: number;
  /** slow pitch wobble for playful sounds */
  bounce?: number;
};

const RECIPES: Record<ConcreteSfxPack, Record<SfxTransition, Recipe>> = {
  // Airy, low-key sweeps that sit under a calm voice.
  soft: {
    fade: { duration: 0.9, noise: 0.5, cutoffFrom: 600, cutoffTo: 3800, toneFrom: 180, toneTo: 260, tone: 0.12, attack: 0.35 },
    slide: { duration: 0.62, noise: 0.55, cutoffFrom: 900, cutoffTo: 5200, toneFrom: 260, toneTo: 420, tone: 0.08, attack: 0.18 },
    wipe: { duration: 0.5, noise: 0.4, cutoffFrom: 2400, cutoffTo: 900, toneFrom: 520, toneTo: 300, tone: 0.1, attack: 0.08 },
  },
  // Low, wide whooshes for launch-style films.
  cinematic: {
    fade: { duration: 1.3, noise: 0.45, cutoffFrom: 120, cutoffTo: 2200, toneFrom: 60, toneTo: 130, tone: 0.35, attack: 0.5 },
    slide: { duration: 0.95, noise: 0.4, cutoffFrom: 200, cutoffTo: 3000, toneFrom: 90, toneTo: 170, tone: 0.25, attack: 0.3 },
    wipe: { duration: 0.8, noise: 0.35, cutoffFrom: 1400, cutoffTo: 200, toneFrom: 140, toneTo: 70, tone: 0.4, attack: 0.05, transient: 0.35 },
  },
  // Short, dry ticks that never draw attention to the edit.
  minimal: {
    fade: { duration: 0.28, noise: 0.25, cutoffFrom: 1800, cutoffTo: 700, toneFrom: 700, toneTo: 520, tone: 0.06, attack: 0.02 },
    slide: { duration: 0.22, noise: 0.3, cutoffFrom: 2600, cutoffTo: 1200, toneFrom: 900, toneTo: 700, tone: 0.05, attack: 0.01 },
    wipe: { duration: 0.34, noise: 0.2, cutoffFrom: 1200, cutoffTo: 2400, toneFrom: 420, toneTo: 640, tone: 0.12, attack: 0.03 },
  },
  // Rounded, musical pops for playful or social edits.
  playful: {
    fade: { duration: 0.45, noise: 0.2, cutoffFrom: 1200, cutoffTo: 4200, toneFrom: 350, toneTo: 780, tone: 0.22, attack: 0.05, transient: 0.25, bounce: 22 },
    slide: { duration: 0.38, noise: 0.25, cutoffFrom: 800, cutoffTo: 2600, toneFrom: 260, toneTo: 520, tone: 0.2, attack: 0.03, transient: 0.2, bounce: 16 },
    wipe: { duration: 0.52, noise: 0.15, cutoffFrom: 2200, cutoffTo: 900, toneFrom: 880, toneTo: 420, tone: 0.25, attack: 0.04, transient: 0.15, bounce: 26 },
  },
};

/** Small seeded PRNG so the same pack always produces the same file. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(pack: ConcreteSfxPack, transition: SfxTransition) {
  return CONCRETE_SFX_PACKS.indexOf(pack) * 101 + SFX_TRANSITIONS.indexOf(transition) * 37 + 7;
}

/**
 * Renders one effect and returns 16-bit mono PCM. A two-pole low-pass gives the
 * noise its "air", the sine sweep supplies weight, and the amplitude envelope
 * keeps the tail clean so transitions never click.
 */
export function renderSfxPcm(pack: ConcreteSfxPack, transition: SfxTransition): Buffer {
  const recipe = RECIPES[pack][transition];
  const frames = Math.floor(recipe.duration * SFX_SAMPLE_RATE);
  const data = Buffer.alloc(frames * 2);
  const random = mulberry32(seedFor(pack, transition));

  let low = 0;
  let low2 = 0;
  let peak = 0;
  const samples = new Float32Array(frames);

  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const seconds = i / SFX_SAMPLE_RATE;

    // Cutoff follows a power curve so sweeps feel natural rather than linear.
    const cutoffHz = recipe.cutoffFrom * Math.pow(recipe.cutoffTo / recipe.cutoffFrom, Math.pow(t, 0.85));
    const coefficient = Math.min(0.92, Math.max(0.0008, (2 * Math.PI * cutoffHz) / SFX_SAMPLE_RATE));
    const noise = random() * 2 - 1;
    low += coefficient * (noise - low);
    low2 += coefficient * (low - low2);
    const bed = low - low2; // high-passes the smoothed noise into a band

    const sweepHz = recipe.toneFrom * Math.pow(recipe.toneTo / recipe.toneFrom, t);
    const wobble = recipe.bounce ? 1 + Math.sin(seconds * recipe.bounce) * 0.035 : 1;
    const tone = Math.sin(2 * Math.PI * sweepHz * wobble * seconds);

    // Fast swell, long release: the shape of a transition, not a drum hit.
    const attackCurve = Math.min(1, Math.pow(t / Math.max(0.001, recipe.attack), 0.7));
    const release = Math.pow(1 - t, 1.4);
    const envelope = attackCurve * release;

    let sample = bed * recipe.noise * 2.2 * envelope + tone * recipe.tone * envelope;

    if (recipe.transient && t < 0.02) {
      const head = 1 - t / 0.02;
      sample += (random() * 2 - 1) * recipe.transient * head * head * 0.9;
    }

    samples[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }

  const gain = peak > 0 ? PEAK / peak : 0;
  const fadeIn = Math.floor(SFX_SAMPLE_RATE * 0.003);
  const fadeOut = Math.floor(SFX_SAMPLE_RATE * 0.012);

  for (let i = 0; i < frames; i++) {
    const head = fadeIn > 0 ? Math.min(1, i / fadeIn) : 1;
    const tail = fadeOut > 0 ? Math.min(1, (frames - 1 - i) / fadeOut) : 1;
    const value = Math.max(-1, Math.min(1, samples[i] * gain * head * tail));
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }

  return data;
}

export function renderSfxWav(pack: ConcreteSfxPack, transition: SfxTransition): Buffer {
  return wrapWav(renderSfxPcm(pack, transition), SFX_SAMPLE_RATE, 1, 16);
}

/**
 * Legacy single whoosh, still used by the render worker when the library cannot
 * be built (read-only disk, for example). New work should use the library.
 */
export function makeWhooshWav(durationSeconds = 0.55, sampleRate = 44100): Buffer {
  const frames = Math.floor(durationSeconds * sampleRate);
  const data = Buffer.alloc(frames * 2);
  const random = mulberry32(1337);
  let lp = 0;
  let lp2 = 0;

  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const noise = random() * 2 - 1;
    const cutoff = 0.04 + 0.35 * Math.pow(t, 1.6);
    lp = lp + cutoff * (noise - lp);
    lp2 = lp2 + cutoff * (lp - lp2);
    const band = lp - lp2;
    const envelope = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 1.5) * Math.pow(1 - t, 0.6);
    const tone = Math.sin(2 * Math.PI * (520 - 260 * t) * (i / sampleRate)) * 0.05;
    const sample = Math.max(-1, Math.min(1, band * 2.4 * envelope + tone * envelope));
    data.writeInt16LE(Math.round(sample * 32767), i * 2);
  }

  return wrapWav(data, sampleRate, 1, 16);
}

/** Wrap raw interleaved PCM in a RIFF/WAVE container. */
export function wrapWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, pcm]);
}

export function wavDurationSeconds(pcmBytes: number, sampleRate: number, channels: number, bitsPerSample: number) {
  const bytesPerSecond = (sampleRate * channels * bitsPerSample) / 8;
  if (!bytesPerSecond) return 0;
  return pcmBytes / bytesPerSecond;
}
