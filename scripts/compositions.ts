/**
 * Verifies the Remotion entry point bundles and exposes the composition at both
 * aspect ratios. Run with `npm run compositions`.
 */
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions } from "@remotion/renderer";
import { defaultSpec } from "../lib/spec";
import { computeTimeline } from "../lib/timing";

const baseProps = {
  spec: defaultSpec("16:9"),
  images: {},
  sceneAudio: {},
  music: null,
  sfx: {},
  sfxVolume: 0.4,
  durations: {},
};

async function main() {
  const serveUrl = await bundle({
    entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
    outDir: path.join(process.cwd(), ".remotion-cache", "verify-bundle"),
  });

  for (const aspect of ["16:9", "9:16"] as const) {
    const spec = { ...defaultSpec(aspect), meta: { ...defaultSpec(aspect).meta, title: `Verify ${aspect}` } };
    spec.scenes = [...spec.scenes, ...spec.scenes.map((scene) => ({ ...scene, id: `${scene.id}-b` }))];
    const props = { ...baseProps, spec };
    const compositions = await getCompositions(serveUrl, { inputProps: props });
    const video = compositions.find((composition) => composition.id === "Video");
    if (!video) throw new Error("Composition 'Video' is missing");

    const timeline = computeTimeline(spec, {});
    const ok =
      video.width === timeline.width &&
      video.height === timeline.height &&
      video.durationInFrames === timeline.totalInFrames;

    console.log(
      `${aspect}: ${video.width}x${video.height}, ${video.durationInFrames} frames @ ${video.fps}fps — ` +
        `${ok ? "matches timing module" : `MISMATCH (expected ${timeline.width}x${timeline.height}, ${timeline.totalInFrames} frames)`}`,
    );
    if (!ok) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
