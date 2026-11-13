import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { computeTimeline, FPS } from "../lib/timing";
import { VideoComposition } from "./Video";
import { defaultCompositionProps, type VideoCompositionProps } from "./types";

/**
 * One composition, six layouts, two aspect ratios. Width, height and duration
 * all come from the spec, so the same entry point renders landscape and
 * portrait cuts without separate registrations.
 */
const calculateMetadata: CalculateMetadataFunction<VideoCompositionProps> = ({ props }) => {
  const timeline = computeTimeline(props.spec, props.durations);
  return {
    durationInFrames: timeline.totalInFrames,
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Video"
      component={VideoComposition}
      durationInFrames={150}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaultCompositionProps}
      calculateMetadata={calculateMetadata}
    />
  );
};
