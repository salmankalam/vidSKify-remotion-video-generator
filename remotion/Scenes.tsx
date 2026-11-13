import React from "react";
import { AbsoluteFill, Img, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { captionCues, type TimedScene } from "../lib/timing";
import type { Scene, VideoSpec } from "../lib/spec";
import { FONT_STACKS } from "./fonts";
import { GRAIN, hexAlpha, type Metrics } from "./theme";

export type SceneRenderProps = {
  scene: Scene;
  spec: VideoSpec;
  timed: TimedScene;
  imageUrl: string | null;
  index: number;
  total: number;
  m: Metrics;
};

function useReveal(delay = 0, distance = 28): React.CSSProperties {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, stiffness: 120, mass: 0.7 },
  });
  return { opacity: progress, transform: `translateY(${(1 - progress) * distance}px)` };
}

/** Hook-safe entrance wrapper: one hook per component instance, never in a loop. */
function Reveal({
  delay = 0,
  distance = 28,
  style,
  children,
}: {
  delay?: number;
  distance?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const reveal = useReveal(delay, distance);
  // width:100% matters inside flex columns, where a block would otherwise
  // shrink to its content and let long headlines overflow the frame.
  return <div style={{ width: "100%", ...reveal, ...style }}>{children}</div>;
}

function Highlight({ text, emphasis, accent }: { text: string; emphasis: string; accent: string }) {
  if (!emphasis) return <>{text}</>;
  const safe = emphasis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safe})`, "i"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === emphasis.toLowerCase() ? (
          <span key={index} style={{ color: accent }}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function Kicker({ children, m, color }: { children: React.ReactNode; m: Metrics; color: string }) {
  return (
    <div
      style={{
        fontSize: m.kicker,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: m.kicker * 0.7,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Artwork for scenes without a photo. It is drawn from the brand palette and a
 * scene seed, so every slot reads as an intentional illustration instead of an
 * empty box, and it occupies exactly the same frame the photo will later fill.
 */
function GeneratedArt({
  palette,
  m,
  seed,
  style,
}: {
  palette: VideoSpec["brand"]["palette"];
  m: Metrics;
  seed: number;
  style: React.CSSProperties;
}) {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 85 + seed) * m.pad * 0.16;
  const cx = 24 + ((seed * 29) % 44);
  const cy = 16 + ((seed * 19) % 38);
  const ring = m.portrait ? m.pad * 1.75 : m.pad * 1.2;
  return (
    <div style={{ ...style, position: "relative", overflow: "hidden", backgroundColor: palette.surface }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(80% 66% at ${cx}% ${cy}%, ${hexAlpha(
            palette.accent,
            0.5,
          )}, transparent 62%), radial-gradient(
            70% 60% at 88% 90%, ${hexAlpha(palette.primary, 0.16)}, transparent 70%),
            linear-gradient(155deg, ${hexAlpha(palette.surface, 0.95)}, ${hexAlpha(
              palette.background,
              0.98,
            )})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: `calc(${cx}% - ${ring * 1.2}px)`,
          top: `calc(${cy}% - ${ring * 1.2}px)`,
          width: ring * 2.4,
          height: ring * 2.4,
          borderRadius: "50%",
          background: `radial-gradient(circle at 42% 36%, ${hexAlpha(palette.accent, 0.26)}, transparent 68%)`,
        }}
      />
      {[0, 1].map((ringIndex) => {
        const size = ring * 2 * (1 + ringIndex * 0.58);
        return (
          <div
            key={`ring-${ringIndex}`}
            style={{
              position: "absolute",
              left: `calc(${cx}% - ${size / 2}px)`,
              top: `calc(${cy}% - ${size / 2}px)`,
              width: size,
              height: size,
              borderRadius: "50%",
              border: `${m.hairline}px solid ${hexAlpha(palette.primary, ringIndex ? 0.13 : 0.28)}`,
              transform: `translate(${drift}px, ${-drift * 0.6}px)`,
            }}
          />
        );
      })}
      {[0, 1, 2].map((lineIndex) => (
        <div
          key={`line-${lineIndex}`}
          style={{
            position: "absolute",
            right: -m.pad * 0.5,
            top: `${20 + lineIndex * 13}%`,
            width: `${32 + lineIndex * 8}%`,
            height: m.hairline,
            backgroundColor: hexAlpha(palette.primary, 0.16),
            transform: "rotate(-24deg)",
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          right: "11%",
          bottom: "13%",
          width: m.portrait ? "20%" : "11%",
          height: m.portrait ? "10%" : "15%",
          borderRadius: m.radius * 0.42,
          background: `linear-gradient(140deg, ${hexAlpha(palette.accent, 0.8)}, ${hexAlpha(
            palette.accent,
            0.16,
          )})`,
          border: `${m.hairline}px solid ${hexAlpha(palette.accent, 0.45)}`,
          boxShadow: `0 0 0 ${m.hairline}px ${hexAlpha(palette.background, 0.25)}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(${hexAlpha(palette.primary, 0.16)} 1px, transparent 1px)`,
          backgroundSize: `${m.pad * 0.52}px ${m.pad * 0.52}px`,
          maskImage: "linear-gradient(205deg, black, transparent 64%)",
          WebkitMaskImage: "linear-gradient(205deg, black, transparent 64%)",
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(0deg, ${hexAlpha(palette.background, 0.5)}, transparent 58%)`,
        }}
      />
      <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, opacity: 0.06, mixBlendMode: "overlay" }} />
    </div>
  );
}

function SceneImage({
  url,
  treatment,
  palette,
  m,
  durationInFrames,
  seed,
  style,
}: {
  url: string | null;
  treatment: Scene["imageTreatment"];
  palette: VideoSpec["brand"]["palette"];
  m: Metrics;
  durationInFrames: number;
  seed: number;
  style: React.CSSProperties;
}) {
  const frame = useCurrentFrame();
  const drift = Math.min(1, frame / Math.max(1, durationInFrames));

  if (!url) {
    return (
      <GeneratedArt
        palette={palette}
        m={m}
        seed={seed}
        style={{
          ...style,
          border: `${m.hairline}px solid ${hexAlpha(palette.primary, 0.12)}`,
        }}
      />
    );
  }

  return (
    <div style={{ ...style, overflow: "hidden", position: "relative", backgroundColor: palette.surface }}>
      <Img
        src={url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          transform: `scale(${1.01 + drift * 0.04})`,
          filter: treatment === "blur" ? "blur(16px) saturate(1.15) brightness(0.9)" : "none",
        }}
      />
      {treatment === "dim" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, ${hexAlpha(palette.background, 0.18)}, ${hexAlpha(
              palette.background,
              0.62,
            )})`,
          }}
        />
      ) : null}
      {treatment === "duotone" ? (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: palette.accent,
              mixBlendMode: "color",
              opacity: 0.75,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: palette.background,
              mixBlendMode: "multiply",
              opacity: 0.3,
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function Captions({ scene, timed, spec, m }: { scene: Scene; timed: TimedScene; spec: VideoSpec; m: Metrics }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cues = captionCues(scene, timed.durationInFrames);
  const cue = cues.find((candidate) => frame >= candidate.from && frame < candidate.from + candidate.duration);
  if (!cue || !scene.narration.trim()) return null;

  const enter = spring({ frame: frame - cue.from, fps, config: { damping: 200, stiffness: 210 } });
  const palette = spec.brand.palette;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: m.pad * 0.85,
        display: "flex",
        justifyContent: "center",
        padding: `0 ${m.pad * 0.5}px`,
      }}
    >
      <div
        style={{
          maxWidth: m.captionMax,
          padding: `${m.caption * 0.5}px ${m.caption * 1.1}px`,
          borderRadius: 999,
          backgroundColor: hexAlpha(palette.background, 0.78),
          border: `${m.hairline}px solid ${hexAlpha(palette.primary, 0.14)}`,
          color: palette.primary,
          fontFamily: FONT_STACKS[spec.brand.fontPair].body,
          fontWeight: 500,
          fontSize: m.caption,
          lineHeight: 1.35,
          textAlign: "center",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 12}px)`,
        }}
      >
        {cue.text}
      </div>
    </div>
  );
}

function Backdrop({ spec }: { spec: VideoSpec }) {
  const p = spec.brand.palette;
  return (
    <>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(110% 90% at 10% 0%, ${hexAlpha(p.surface, 0.95)} 0%, ${hexAlpha(
            p.background,
            0,
          )} 55%), radial-gradient(70% 70% at 100% 100%, ${hexAlpha(p.accent, 0.14)} 0%, ${hexAlpha(
            p.background,
            0,
          )} 60%)`,
        }}
      />
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.045, mixBlendMode: "overlay" }} />
    </>
  );
}

function Chrome({
  m,
  palette,
  title,
  index,
  total,
}: {
  m: Metrics;
  palette: VideoSpec["brand"]["palette"];
  title: string;
  index: number;
  total: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: m.pad * 0.55,
        left: m.pad,
        right: m.pad,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: m.kicker * 0.82,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: hexAlpha(palette.text, 0.75),
        fontWeight: 500,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: m.kicker * 0.5, minWidth: 0 }}>
        <div
          style={{
            width: m.kicker * 0.45,
            height: m.kicker * 0.45,
            borderRadius: 999,
            backgroundColor: palette.accent,
            flexShrink: 0,
          }}
        />
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
      </div>
      <div style={{ flexShrink: 0, paddingLeft: m.kicker }}>
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>
    </div>
  );
}

/* ------------------------------- layouts -------------------------------- */

/** A supplied photo quietly backs a text-led scene instead of being ignored. */
function PhotoBackdrop({ imageUrl, palette, m, timed, seed }: { imageUrl: string | null; palette: VideoSpec["brand"]["palette"]; m: Metrics; timed: TimedScene; seed: number }) {
  if (!imageUrl) return null;
  return (
    <>
      <SceneImage
        url={imageUrl}
        treatment="dim"
        palette={palette}
        m={m}
        durationInFrames={timed.durationInFrames}
        seed={seed}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(125% 95% at 50% 42%, ${hexAlpha(palette.background, 0.74)}, ${hexAlpha(
            palette.background,
            0.94,
          )} 78%)`,
        }}
      />
    </>
  );
}

function Hook({ scene, spec, m, imageUrl, timed, index }: SceneRenderProps) {
  const palette = spec.brand.palette;
  const fonts = FONT_STACKS[spec.brand.fontPair];
  // Reserve the caption band: long openers would otherwise run underneath it.
  const captionBand = m.caption * 4;
  return (
    <AbsoluteFill
      style={{
        padding: m.pad,
        paddingBottom: m.pad + captionBand,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <PhotoBackdrop imageUrl={imageUrl} palette={palette} m={m} timed={timed} seed={index} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: m.gap * 0.6, width: "100%" }}>
        <Reveal delay={0} distance={16} style={{ width: "auto" }}>
          <Kicker m={m} color={palette.accent}>
            <span
              style={{ width: m.kicker * 1.6, height: m.hairline, backgroundColor: hexAlpha(palette.accent, 0.7) }}
            />
            {spec.meta.tone || "A short film"}
          </Kicker>
        </Reveal>
        <Reveal delay={5} distance={40}>
          <h1
            style={{
              fontFamily: fonts.display,
              fontWeight: 700,
              // Long openers shrink instead of filling the frame and colliding.
              fontSize: m.headingBig * (scene.heading.length > 46 ? 0.8 : 1),
              lineHeight: 0.98,
              letterSpacing: spec.brand.fontPair === "editorial" ? "-0.015em" : "-0.035em",
              color: palette.primary,
              maxWidth: "100%",
              margin: 0,
              overflowWrap: "break-word",
              textWrap: "balance",
            }}
          >
            <Highlight text={scene.heading} emphasis={scene.emphasis} accent={palette.accent} />
          </h1>
        </Reveal>
        {scene.body ? (
          <Reveal delay={14} distance={20}>
            <p
              style={{
                fontFamily: fonts.body,
                fontSize: m.body,
                lineHeight: 1.45,
                color: palette.text,
                maxWidth: m.portrait ? "88%" : "64%",
                margin: 0,
              }}
            >
              {scene.body}
            </p>
          </Reveal>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function Split({ scene, spec, m, imageUrl, index, timed }: SceneRenderProps) {
  const palette = spec.brand.palette;
  const fonts = FONT_STACKS[spec.brand.fontPair];
  const imageFirst = index % 2 === 1;
  const imageStyle: React.CSSProperties = {
    flex: "1 1 48%",
    height: m.portrait ? "40%" : "100%",
    minHeight: m.portrait ? "34%" : undefined,
    borderRadius: m.radius,
  };
  const text = (
    <div
      style={{
        flex: "1 1 52%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: m.gap * 0.42,
        order: m.portrait ? 2 : imageFirst ? 1 : 0,
      }}
    >
      <Reveal delay={2} distance={14}>
        <Kicker m={m} color={palette.accent}>
          {String(index + 1).padStart(2, "0")} — {spec.meta.tone}
        </Kicker>
      </Reveal>
      <Reveal delay={6} distance={30}>
        <h2
          style={{
            fontFamily: fonts.display,
            fontWeight: 700,
            fontSize: m.heading,
            lineHeight: 1.02,
            letterSpacing: spec.brand.fontPair === "editorial" ? "-0.01em" : "-0.03em",
            color: palette.primary,
            margin: 0,
            overflowWrap: "break-word",
            textWrap: "balance",
          }}
        >
          <Highlight text={scene.heading} emphasis={scene.emphasis} accent={palette.accent} />
        </h2>
      </Reveal>
      {scene.body ? (
        <Reveal delay={12} distance={18}>
          <p
            style={{
              fontFamily: fonts.body,
              fontSize: m.body,
              lineHeight: 1.5,
              color: palette.text,
              margin: 0,
              maxWidth: "95%",
            }}
          >
            {scene.body}
          </p>
        </Reveal>
      ) : null}
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        padding: m.pad,
        paddingTop: m.pad * 1.5,
        display: "flex",
        flexDirection: m.portrait ? "column" : "row",
        gap: m.gap,
        alignItems: "stretch",
        justifyContent: "center",
      }}
    >
      {imageFirst ? (
        <>
          <SceneImage
            url={imageUrl}
            treatment={scene.imageTreatment}
            palette={palette}
            m={m}
            durationInFrames={timed.durationInFrames}
            seed={index}
            style={imageStyle}
          />
          {text}
        </>
      ) : (
        <>
          {text}
          <SceneImage
            url={imageUrl}
            treatment={scene.imageTreatment}
            palette={palette}
            m={m}
            durationInFrames={timed.durationInFrames}
            seed={index}
            style={imageStyle}
          />
        </>
      )}
    </AbsoluteFill>
  );
}

function FullBleed({ scene, spec, m, imageUrl, timed, index }: SceneRenderProps) {
  const palette = spec.brand.palette;
  const fonts = FONT_STACKS[spec.brand.fontPair];
  return (
    <AbsoluteFill>
      <SceneImage
        url={imageUrl}
        treatment="none"
        palette={palette}
        m={m}
        durationInFrames={timed.durationInFrames}
        seed={index}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${hexAlpha(palette.background, 0.55)} 0%, ${hexAlpha(
            palette.background,
            0.1,
          )} 35%, ${hexAlpha(palette.background, 0.88)} 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: m.pad,
          right: m.pad,
          bottom: m.pad * 1.7,
          display: "flex",
          flexDirection: "column",
          gap: m.gap * 0.38,
          maxWidth: m.portrait ? "100%" : "66%",
        }}
      >
        <Reveal delay={2} distance={14}>
          <Kicker m={m} color={palette.accent}>
            {String(index + 1).padStart(2, "0")}
          </Kicker>
        </Reveal>
        <Reveal delay={6} distance={34}>
          <h2
            style={{
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: m.heading,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              color: palette.primary,
              margin: 0,
              overflowWrap: "break-word",
              textShadow: `0 2px ${m.heading * 0.12}px ${hexAlpha(palette.background, 0.5)}`,
            }}
          >
            <Highlight text={scene.heading} emphasis={scene.emphasis} accent={palette.accent} />
          </h2>
        </Reveal>
        {scene.body ? (
          <Reveal delay={12} distance={18}>
            <p
              style={{
                fontFamily: fonts.body,
                fontSize: m.body,
                lineHeight: 1.5,
                color: palette.primary,
                opacity: 0.82,
                margin: 0,
              }}
            >
              {scene.body}
            </p>
          </Reveal>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function Statement({ scene, spec, m, imageUrl, timed, index }: SceneRenderProps) {
  const palette = spec.brand.palette;
  const fonts = FONT_STACKS[spec.brand.fontPair];
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const line = spring({ frame: frame - 4, fps, config: { damping: 200, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ padding: m.pad, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <PhotoBackdrop imageUrl={imageUrl} palette={palette} m={m} timed={timed} seed={index} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: m.gap * 0.5,
          width: "100%",
          maxWidth: "94%",
        }}
      >
        <div
          style={{
            width: `${line * 22}%`,
            height: m.hairline * 2,
            backgroundColor: palette.accent,
            borderRadius: 999,
          }}
        />
        <Reveal delay={4} distance={38}>
          <h2
            style={{
              fontFamily: fonts.display,
              fontWeight: spec.brand.fontPair === "bold" ? 400 : 700,
              fontSize: m.headingBig,
              lineHeight: 1.02,
              letterSpacing: spec.brand.fontPair === "editorial" ? "0" : "-0.035em",
              color: palette.primary,
              margin: 0,
              overflowWrap: "break-word",
              textWrap: "balance",
              textTransform: spec.brand.fontPair === "bold" ? "uppercase" : "none",
            }}
          >
            <Highlight text={scene.heading} emphasis={scene.emphasis} accent={palette.accent} />
          </h2>
        </Reveal>
        {scene.body ? (
          <Reveal delay={12} distance={18}>
            <p
              style={{
                fontFamily: fonts.body,
                fontSize: m.body,
                lineHeight: 1.5,
                color: palette.text,
                margin: 0,
                maxWidth: m.portrait ? "92%" : "70%",
              }}
            >
              {scene.body}
            </p>
          </Reveal>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function ListLayout({ scene, spec, m, index, imageUrl, timed }: SceneRenderProps) {
  const palette = spec.brand.palette;
  const fonts = FONT_STACKS[spec.brand.fontPair];
  const items = scene.body
    .split(/\n|(?<=\.)\s+/)
    .map((item) => item.trim().replace(/[.;]$/, ""))
    .filter(Boolean)
    .slice(0, 4);
  const list = items.length ? items : [scene.heading];

  return (
    <AbsoluteFill
      style={{
        padding: m.pad,
        paddingTop: m.pad * 1.4,
        display: "flex",
        flexDirection: m.portrait ? "column" : "row",
        gap: m.gap,
        justifyContent: "center",
        alignItems: m.portrait ? "stretch" : "center",
      }}
    >
      <PhotoBackdrop imageUrl={imageUrl} palette={palette} m={m} timed={timed} seed={index} />
      <div style={{ flex: "1 1 42%", display: "flex", flexDirection: "column", gap: m.gap * 0.4 }}>
        <Reveal delay={2} distance={14}>
          <Kicker m={m} color={palette.accent}>
            {String(index + 1).padStart(2, "0")} — The details
          </Kicker>
        </Reveal>
        <Reveal delay={6} distance={30}>
          <h2
            style={{
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: m.heading * 0.92,
              lineHeight: 1.03,
              letterSpacing: "-0.03em",
              color: palette.primary,
              margin: 0,
            }}
          >
            <Highlight text={scene.heading} emphasis={scene.emphasis} accent={palette.accent} />
          </h2>
        </Reveal>
      </div>
      <div style={{ flex: "1 1 58%", display: "flex", flexDirection: "column", gap: m.gap * 0.34 }}>
        {list.map((item, i) => (
          <Reveal
            key={`${item}-${i}`}
            delay={10 + i * 5}
            distance={22}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: m.body * 0.7,
              paddingBottom: m.gap * 0.25,
              borderBottom: `${m.hairline}px solid ${hexAlpha(palette.primary, 0.14)}`,
            }}
          >
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: m.kicker,
                fontWeight: 600,
                color: palette.accent,
                paddingTop: m.body * 0.18,
                minWidth: m.kicker * 1.6,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: m.body * 1.08,
                lineHeight: 1.35,
                color: palette.primary,
                fontWeight: 500,
              }}
            >
              {item}
            </div>
          </Reveal>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function Cta({ scene, spec, m, imageUrl, timed, index }: SceneRenderProps) {
  const palette = spec.brand.palette;
  const fonts = FONT_STACKS[spec.brand.fontPair];
  const label = scene.emphasis || "Get started";
  return (
    <AbsoluteFill
      style={{
        padding: m.pad,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        backgroundColor: hexAlpha(palette.surface, 0.35),
      }}
    >
      <PhotoBackdrop imageUrl={imageUrl} palette={palette} m={m} timed={timed} seed={index} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: m.gap * 0.55, width: "100%" }}>
        <Reveal delay={2} distance={34}>
          <h2
            style={{
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: m.headingBig,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              color: palette.primary,
              margin: 0,
              maxWidth: "100%",
              overflowWrap: "break-word",
              textWrap: "balance",
            }}
          >
            <Highlight text={scene.heading} emphasis={scene.emphasis} accent={palette.accent} />
          </h2>
        </Reveal>
        {scene.body ? (
          <Reveal delay={9} distance={18}>
            <p
              style={{
                fontFamily: fonts.body,
                fontSize: m.body,
                lineHeight: 1.5,
                color: palette.text,
                margin: 0,
                maxWidth: m.portrait ? "90%" : "60%",
              }}
            >
              {scene.body}
            </p>
          </Reveal>
        ) : null}
        <Reveal delay={16} distance={22}>
          <div
            style={{
              marginTop: m.gap * 0.2,
              display: "inline-flex",
              alignItems: "center",
              gap: m.body * 0.55,
              backgroundColor: palette.accent,
              color: palette.background,
              fontFamily: fonts.body,
              fontWeight: 600,
              fontSize: m.body * 0.92,
              letterSpacing: "0.01em",
              padding: `${m.body * 0.6}px ${m.body * 1.25}px`,
              borderRadius: 999,
            }}
          >
            {label}
            <span style={{ fontSize: m.body }}>↗</span>
          </div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
}

export function SceneRenderer(props: SceneRenderProps) {
  const { scene, spec, m, index, total, timed } = props;
  const palette = spec.brand.palette;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.background,
        fontFamily: FONT_STACKS[spec.brand.fontPair].body,
      }}
    >
      <Backdrop spec={spec} />
      {scene.layout === "hook" ? <Hook {...props} /> : null}
      {scene.layout === "split" ? <Split {...props} /> : null}
      {scene.layout === "fullBleed" ? <FullBleed {...props} /> : null}
      {scene.layout === "statement" ? <Statement {...props} /> : null}
      {scene.layout === "list" ? <ListLayout {...props} /> : null}
      {scene.layout === "cta" ? <Cta {...props} /> : null}
      <Chrome m={m} palette={palette} title={spec.meta.title} index={index} total={total} />
      {spec.captions.enabled ? <Captions scene={scene} timed={timed} spec={spec} m={m} /> : null}
    </AbsoluteFill>
  );
}
