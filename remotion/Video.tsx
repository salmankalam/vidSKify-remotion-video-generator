import React from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { linearTiming, TransitionSeries, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { computeTimeline } from "../lib/timing";
import type { TransitionKind } from "../lib/spec";
import { SceneRenderer } from "./Scenes";
import { hexAlpha, metrics } from "./theme";
import type { VideoCompositionProps } from "./types";

function transitionPresentation(kind: TransitionKind, index: number): TransitionPresentation<any> {
  switch (kind) {
    case "slide":
      return slide({ direction: index % 2 === 0 ? "from-right" : "from-left" });
    case "wipe":
      return wipe({ direction: index % 2 === 0 ? "from-bottom" : "from-top" });
    case "fade":
    default:
      return fade();
  }
}

function ProgressBar({ color }: { color: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const m = metrics(width, height);
  const progress = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames - 1)));
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: m.progressHeight,
        backgroundColor: hexAlpha(color, 0.18),
      }}
    >
      <div style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: color }} />
    </div>
  );
}

export const VideoComposition: React.FC<VideoCompositionProps> = (props) => {
  const { spec, durations, images, sceneAudio, music, sfx, sfxVolume } = props;
  const timeline = computeTimeline(spec, durations);
  const { width, height } = useVideoConfig();
  const m = metrics(width, height);

  const children: React.ReactNode[] = [];
  timeline.scenes.forEach((timed, index) => {
    const { scene } = timed;
    children.push(
      <TransitionSeries.Sequence key={scene.id} durationInFrames={timed.durationInFrames}>
        <SceneRenderer
          scene={scene}
          spec={spec}
          timed={timed}
          imageUrl={scene.imageAssetId ? images[scene.imageAssetId] ?? null : null}
          index={index}
          total={timeline.scenes.length}
          m={m}
        />
        {sceneAudio[scene.id] ? <Audio src={sceneAudio[scene.id]} /> : null}
      </TransitionSeries.Sequence>,
    );

    const isLast = index === timeline.scenes.length - 1;
    if (!isLast) {
      const next = timeline.scenes[index + 1];
      if (timed.transitionInFrames > 0) {
        children.push(
          <TransitionSeries.Transition
            key={`transition-${scene.id}`}
            presentation={transitionPresentation(next.scene.transition, index)}
            timing={linearTiming({ durationInFrames: timed.transitionInFrames })}
          />,
        );
      }
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: spec.brand.palette.background }}>
      {music ? <Audio src={music} loop volume={spec.audio.musicVolume} /> : null}
      <TransitionSeries>{children}</TransitionSeries>
      {timeline.scenes.slice(0, -1).map((timed, index) => {
        // The sound belongs to the transition that starts the *next* scene, and
        // "none" means no transition, so no sound either.
        const kind = timeline.scenes[index + 1]?.scene.transition;
        if (!kind || kind === "none") return null;
        const src = sfx[kind];
        if (!src) return null;
        return (
          <Sequence
            key={`sfx-${timed.scene.id}`}
            from={Math.max(0, timed.from + timed.durationInFrames - timed.transitionInFrames - 2)}
            durationInFrames={45}
          >
            <Audio src={src} volume={sfxVolume} />
          </Sequence>
        );
      })}
      <ProgressBar color={spec.brand.palette.accent} />
    </AbsoluteFill>
  );
};
