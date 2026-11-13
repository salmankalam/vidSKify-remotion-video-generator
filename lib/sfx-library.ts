import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import {
  CONCRETE_SFX_PACKS,
  SFX_SAMPLE_RATE,
  SFX_TRANSITIONS,
  renderSfxWav,
  wavDurationSeconds,
  type ConcreteSfxPack,
  type SfxTransition,
} from "./sfx";

/**
 * Voiceover is per project; sound effects are not. The library is generated once
 * into storage/sfx/<version>/ and served read-only to every render, so a new
 * video never pays the cost of building (or licensing) its transition sounds.
 */
export const SFX_LIBRARY_VERSION = "v1";
/** Bump when the synthesis changes; old files are then rebuilt on next use. */
export const SFX_GENERATOR_VERSION = 1;

export type SfxManifestEntry = {
  id: string;
  pack: ConcreteSfxPack;
  transition: SfxTransition;
  file: string;
  durationSeconds: number;
  bytes: number;
};

export type SfxManifest = {
  version: string;
  generator: number;
  sampleRate: number;
  builtAt: string;
  sounds: SfxManifestEntry[];
};

export function sfxLibraryDir() {
  return path.join(process.cwd(), "storage", "sfx", SFX_LIBRARY_VERSION);
}

export function sfxId(pack: ConcreteSfxPack, transition: SfxTransition) {
  return `${pack}-${transition}`;
}

export function sfxFilename(pack: ConcreteSfxPack, transition: SfxTransition) {
  return `${sfxId(pack, transition)}.wav`;
}

/** Strict lookup: callers pass a name from the manifest, never user input. */
export function sfxFilePath(file: string): string | null {
  if (!/^[a-z0-9-]+\.wav$/.test(file)) return null;
  return path.join(sfxLibraryDir(), file);
}

function manifestPath() {
  return path.join(sfxLibraryDir(), "manifest.json");
}

async function readManifest(): Promise<SfxManifest | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath(), "utf8")) as SfxManifest;
    if (parsed.version !== SFX_LIBRARY_VERSION || parsed.generator !== SFX_GENERATOR_VERSION) return null;
    if (!Array.isArray(parsed.sounds) || !parsed.sounds.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

let cached: Promise<SfxManifest> | null = null;

/**
 * Idempotent: missing files are generated, existing ones are reused untouched.
 * Safe to call from the worker on every render and from the API on every request.
 */
export async function ensureSfxLibrary(): Promise<SfxManifest> {
  if (cached) return cached;
  cached = (async () => {
    const dir = sfxLibraryDir();
    await fs.mkdir(dir, { recursive: true });

    const existing = await readManifest();
    const sounds: SfxManifestEntry[] = [];

    for (const pack of CONCRETE_SFX_PACKS) {
      for (const transition of SFX_TRANSITIONS) {
        const file = sfxFilename(pack, transition);
        const absolute = path.join(dir, file);
        let bytes = 0;

        if (existsSync(absolute)) {
          bytes = (await fs.stat(absolute)).size;
        }

        // Regenerate when the file is missing or the manifest is stale.
        if (!existing || !bytes) {
          const wav = renderSfxWav(pack, transition);
          await fs.writeFile(absolute, wav);
          bytes = wav.byteLength;
        }

        sounds.push({
          id: sfxId(pack, transition),
          pack,
          transition,
          file,
          // 44-byte RIFF header + 16-bit mono PCM at a fixed sample rate.
          durationSeconds:
            Math.round(
              wavDurationSeconds(Math.max(0, bytes - 44), SFX_SAMPLE_RATE, 1, 16) * 100,
            ) / 100,
          bytes,
        });
      }
    }

    const manifest: SfxManifest = {
      version: SFX_LIBRARY_VERSION,
      generator: SFX_GENERATOR_VERSION,
      sampleRate: SFX_SAMPLE_RATE,
      builtAt: existing?.builtAt ?? new Date().toISOString(),
      sounds,
    };

    await fs.writeFile(manifestPath(), JSON.stringify(manifest, null, 2));
    return manifest;
  })();

  try {
    return await cached;
  } catch (error) {
    cached = null;
    throw error;
  }
}
