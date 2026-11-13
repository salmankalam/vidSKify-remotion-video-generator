"use client";

import { useEffect, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { VideoComposition } from "@/remotion/Video";
import type { VideoCompositionProps } from "@/remotion/types";

type Props = {
  compositionProps: VideoCompositionProps;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  /** Bump `nonce` to scrub the player to `frame`. */
  seek?: { frame: number; nonce: number };
};

/**
 * The Player runs the same composition as the renderer, so what you scrub here
 * is what lands in the MP4.
 */
export default function PreviewPane(props: Props) {
  const player = useRef<PlayerRef>(null);

  useEffect(() => {
    if (props.seek) player.current?.seekTo(Math.max(0, props.seek.frame));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.seek?.nonce]);

  return (
    <div
      className="overflow-hidden rounded-[10px] bg-black shadow-[0_30px_80px_-40px_rgba(0,0,0,1)] ring-1 ring-white/[0.06]"
      style={{ aspectRatio: `${props.width} / ${props.height}`, width: "100%" }}
    >
      <Player
        ref={player}
        component={VideoComposition}
        inputProps={props.compositionProps}
        durationInFrames={props.durationInFrames}
        fps={props.fps}
        compositionWidth={props.width}
        compositionHeight={props.height}
        style={{ width: "100%", height: "100%" }}
        controls
        loop
        acknowledgeRemotionLicense
      />
    </div>
  );
}
