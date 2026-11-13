import { fontPairFor, summarizeWebsite, type WebsiteSummary } from "./website";
import type { FontPair, Palette } from "../spec";

/**
 * Next-side client for the worker's browser capture. If the worker is offline
 * (or the page cannot be rendered) it degrades to the HTML scraper, so the new
 * video flow never hard-fails on a website that blocks headless Chrome.
 */

export type SiteIntel = WebsiteSummary & {
  palette?: Palette;
  fontFamily?: string;
  fontPair?: FontPair;
};

export type SiteAnalysis = {
  intel: SiteIntel;
  screenshot: Buffer | null;
  /** Pixel size of the capture, used to store the asset accurately. */
  width: number;
  height: number;
  source: "capture" | "html";
};

const WORKER = process.env.RENDER_WORKER_URL || "http://127.0.0.1:4321";

function validPalette(value: any): value is Palette {
  if (!value) return false;
  return ["background", "surface", "primary", "accent", "text"].every((key) =>
    /^#[0-9a-fA-F]{6}$/.test(String(value[key] ?? "")),
  );
}

export async function analyzeWebsite(
  url: string,
  options: { refresh?: boolean; aspect?: string } = {},
): Promise<SiteAnalysis> {
  const aspect = options.aspect === "9:16" ? "9:16" : "16:9";
  try {
    const response = await fetch(`${WORKER}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, refresh: Boolean(options.refresh), aspect }),
      signal: AbortSignal.timeout(45_000),
    });

    if (response.ok) {
      const data = await response.json();
      if (validPalette(data?.palette) && typeof data?.screenshot === "string") {
        const screenshot = Buffer.from(data.screenshot, "base64");
        if (screenshot.byteLength > 1024) {
          const display = String(data.fontDisplay ?? "");
          const body = String(data.fontBody ?? "");
          return {
            intel: {
              url: String(data.url ?? url),
              title: String(data.title ?? ""),
              description: String(data.description ?? ""),
              text: String(data.text ?? ""),
              palette: data.palette,
              fontFamily: display || body || undefined,
              fontPair: fontPairFor(display, body),
            },
            screenshot,
            width: Number(data.width) || 0,
            height: Number(data.height) || 0,
            source: "capture",
          };
        }
      }
    }
  } catch {
    /* worker offline or capture failed: fall back to reading the HTML */
  }

  const summary = await summarizeWebsite(url);
  return { intel: summary, screenshot: null, width: 0, height: 0, source: "html" };
}
