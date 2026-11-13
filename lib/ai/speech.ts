import { execFile, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AIError } from "./client";

/**
 * Voiceover runs on Edge TTS (the free Microsoft neural voices) through a tiny
 * Python helper, because APInex serves chat models only. It is local, free and
 * good enough for narration, and it reports word timings we use for exact scene
 * pacing.
 */
const VOICE_MAP: Record<string, { voice: string; rate: string; pitch: string }> = {
  alloy: { voice: "en-US-AndrewMultilingualNeural", rate: "+0%", pitch: "+0Hz" },
  ash: { voice: "en-US-BrianNeural", rate: "-2%", pitch: "-2Hz" },
  ballad: { voice: "en-GB-ThomasNeural", rate: "-4%", pitch: "-1Hz" },
  coral: { voice: "en-US-AvaNeural", rate: "+2%", pitch: "+2Hz" },
  echo: { voice: "en-US-ChristopherNeural", rate: "+0%", pitch: "-3Hz" },
  fable: { voice: "en-GB-RyanNeural", rate: "+3%", pitch: "+1Hz" },
  nova: { voice: "en-US-AvaMultilingualNeural", rate: "+4%", pitch: "+2Hz" },
  onyx: { voice: "en-US-SteffanNeural", rate: "-3%", pitch: "-4Hz" },
  sage: { voice: "en-GB-SoniaNeural", rate: "-2%", pitch: "+0Hz" },
  shimmer: { voice: "en-US-EmmaNeural", rate: "+3%", pitch: "+3Hz" },
  verse: { voice: "en-US-JennyNeural", rate: "+0%", pitch: "+1Hz" },
};

export function edgeVoice(voice: string) {
  return VOICE_MAP[voice] ?? VOICE_MAP.nova;
}

function pythonBin() {
  return process.env.TTS_PYTHON?.trim() || (process.platform === "win32" ? "python" : "python3");
}

let probed: boolean | null = null;

/** Cached probe: is `edge-tts` importable by the configured Python? */
export function hasSpeech() {
  if (probed !== null) return probed;
  if (process.env.TTS_ENABLED === "off") return (probed = false);
  try {
    execFileSync(pythonBin(), ["-c", "import edge_tts"], {
      timeout: 20_000,
      stdio: "ignore",
      windowsHide: true,
    });
    probed = true;
  } catch {
    probed = false;
  }
  return probed;
}

export type SpeechClip = { data: Buffer; mime: string; seconds: number };

function runHelper(payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      pythonBin(),
      [path.join(process.cwd(), "scripts", "tts.py")],
      { timeout: 120_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || stdout || error.message).trim().split("\n").slice(-2).join(" ");
          reject(new AIError(`Voiceover failed: ${detail.slice(0, 300)}`, 502));
          return;
        }
        resolve(String(stdout));
      },
    );
    child.stdin?.end(payload);
  });
}

/**
 * Returns an MP3 clip plus the spoken length measured from word boundaries, so
 * scene durations and captions follow the actual voice instead of an estimate.
 */
export async function synthesizeSpeech(options: {
  text: string;
  voice: string;
  /** Tone hint, e.g. "energetic" — nudges the speaking rate. */
  tone?: string;
}): Promise<SpeechClip> {
  if (!hasSpeech()) {
    throw new AIError("Voiceover needs Edge TTS. Install it once with: pip install edge-tts", 400);
  }

  const preset = edgeVoice(options.voice);
  const tone = (options.tone ?? "").toLowerCase();
  const energetic = /energetic|punchy|bold|upbeat|fast/.test(tone);
  const calm = /calm|reflective|quiet|slow|intimate/.test(tone);
  const base = Number(preset.rate.replace(/[^-\d.]/g, "")) || 0;
  const offset = Math.round(base + (energetic ? 8 : calm ? -8 : 0));
  const rate = `${offset >= 0 ? "+" : ""}${offset}%`;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "frame-tts-"));
  const out = path.join(dir, "voice.mp3");
  try {
    const stdout = await runHelper(
      JSON.stringify({
        text: options.text.slice(0, 4000),
        voice: preset.voice,
        rate,
        pitch: preset.pitch,
        out,
      }),
    );

    const data = await fs.readFile(out);
    if (!data.byteLength) throw new AIError("Voiceover produced an empty clip", 502);

    let seconds = 0;
    try {
      seconds = Number(JSON.parse(stdout.trim()).seconds);
    } catch {
      seconds = 0;
    }
    if (!Number.isFinite(seconds) || seconds <= 0) {
      // Edge encodes 24 kHz mono at ~48 kbps; good enough only as a fallback.
      seconds = (data.byteLength * 8) / 48_000;
    }

    return { data, mime: "audio/mpeg", seconds: Math.round(seconds * 100) / 100 };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
