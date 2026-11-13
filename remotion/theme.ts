export type Metrics = {
  portrait: boolean;
  pad: number;
  heading: number;
  headingBig: number;
  body: number;
  kicker: number;
  caption: number;
  captionMax: number;
  radius: number;
  gap: number;
  hairline: number;
  progressHeight: number;
};

/**
 * Everything is derived from the frame width so a composition scales cleanly
 * between 1920x1080 and 1080x1920 without hand-tuned breakpoints.
 */
export function metrics(width: number, height: number): Metrics {
  const portrait = height > width;
  if (portrait) {
    return {
      portrait,
      pad: width * 0.075,
      heading: width * 0.092,
      headingBig: width * 0.104,
      body: width * 0.032,
      kicker: width * 0.0185,
      caption: width * 0.027,
      captionMax: width * 0.86,
      radius: width * 0.045,
      gap: width * 0.055,
      hairline: Math.max(1, width * 0.0018),
      progressHeight: width * 0.006,
    };
  }
  return {
    portrait,
    pad: width * 0.058,
    heading: width * 0.07,
    headingBig: width * 0.076,
    body: width * 0.0195,
    kicker: width * 0.0105,
    caption: width * 0.0145,
    captionMax: width * 0.62,
    radius: width * 0.018,
    gap: width * 0.034,
    hairline: Math.max(1, width * 0.0014),
    progressHeight: width * 0.0028,
  };
}

export function hexAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='180' height='180' filter='url(%23n)' opacity='0.55'/></svg>\")";
