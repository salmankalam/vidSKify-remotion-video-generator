import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureBrowser, openBrowser } from "@remotion/renderer";
import { assertPublicUrl } from "./website";
import type { Palette } from "../spec";

/**
 * Captures a real page — copy, palette, type and a screenshot — with the Chrome
 * Headless Shell Remotion already installs. That keeps the app dependency-free:
 * no puppeteer, no third-party screenshot service, no API key.
 *
 * Both page scripts are strings, not functions: the worker is bundled with
 * esbuild's keepNames, which injects `__name()` wrappers that do not exist in
 * the browser context.
 */

export type SiteCapture = {
  url: string;
  title: string;
  description: string;
  headline: string;
  text: string;
  palette: Palette;
  fontDisplay: string;
  fontBody: string;
  width: number;
  height: number;
  capturedAt: string;
  screenshot: Buffer;
};

type CaptureMeta = Omit<SiteCapture, "screenshot">;

const CACHE_DIR = path.join(process.cwd(), "storage", "site-cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Capture in the video's own shape: a landscape grab is unusable in a 9:16 frame. */
function viewportFor(aspect: string) {
  return aspect === "9:16" ? { width: 900, height: 1440 } : { width: 1440, height: 900 };
}

function cacheKey(url: string, viewport: { width: number; height: number }) {
  return createHash("sha1")
    .update(`${url.trim().toLowerCase()}|${viewport.width}x${viewport.height}`)
    .digest("hex")
    .slice(0, 20);
}

function cachePaths(url: string, viewport: { width: number; height: number }) {
  const key = cacheKey(url, viewport);
  return {
    meta: path.join(CACHE_DIR, `${key}.json`),
    image: path.join(CACHE_DIR, `${key}.jpg`),
  };
}

async function readCache(url: string, viewport: { width: number; height: number }): Promise<SiteCapture | null> {
  const files = cachePaths(url, viewport);
  try {
    const [raw, image, stat] = await Promise.all([
      fs.readFile(files.meta, "utf8"),
      fs.readFile(files.image),
      fs.stat(files.meta),
    ]);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    const meta = JSON.parse(raw) as CaptureMeta;
    if (!meta?.palette || !image.byteLength) return null;
    return { ...meta, screenshot: image };
  } catch {
    return null;
  }
}

async function writeCache(capture: SiteCapture) {
  const files = cachePaths(capture.url, { width: capture.width, height: capture.height });
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const { screenshot, ...meta } = capture;
  await fs.writeFile(files.image, screenshot);
  await fs.writeFile(files.meta, JSON.stringify(meta, null, 2));
}

/** Wait for fonts and images so the screenshot is the real, settled page. */
const SETTLE_SCRIPT = String.raw`(async () => {
  if (document.readyState !== "complete") {
    await new Promise(function (resolve) {
      window.addEventListener("load", resolve, { once: true });
    });
  }
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (error) {}
  }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  await wait(500);
  var pending = Array.prototype.slice.call(document.images).filter(function (image) {
    return !image.complete;
  }).slice(0, 24);
  await Promise.all(pending.map(function (image) {
    return new Promise(function (resolve) {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
      setTimeout(resolve, 2500);
    });
  }));
  window.scrollTo(0, 0);
  await wait(250);
  return true;
})()`;

/** Read copy, palette and type from the rendered page. Self-contained JS. */
const EXTRACT_SCRIPT = String.raw`(() => {
  var parse = function (value) {
    var match = String(value).match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    var parts = match[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    var alpha = parts.length > 3 ? parts[3] : 1;
    if (!isFinite(alpha) || alpha < 0.5) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
  };

  var hex = function (color) {
    return "#" + [color.r, color.g, color.b].map(function (channel) {
      var value = Math.max(0, Math.min(255, Math.round(channel))).toString(16);
      return value.length === 1 ? "0" + value : value;
    }).join("");
  };

  var rgb = function (value) {
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16)
    };
  };

  var luminance = function (value) {
    var color = rgb(value);
    var channels = [color.r, color.g, color.b].map(function (channel) {
      var c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  var contrast = function (a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    var lighter = Math.max(la, lb);
    var darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
  };

  var saturation = function (value) {
    var color = rgb(value);
    var max = Math.max(color.r, color.g, color.b) / 255;
    var min = Math.min(color.r, color.g, color.b) / 255;
    if (max === min) return 0;
    var l = (max + min) / 2;
    return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  };

  var mix = function (value, target, amount) {
    var a = rgb(value);
    var b = rgb(target);
    return hex({
      r: a.r + (b.r - a.r) * amount,
      g: a.g + (b.g - a.g) * amount,
      b: a.b + (b.b - a.b) * amount
    });
  };

  // Push a colour toward black or white until it is readable on its background.
  var readable = function (value, background, target) {
    if (contrast(value, background) >= target) return value;
    var toward = luminance(background) > 0.45 ? "#000000" : "#ffffff";
    for (var step = 0.06; step <= 0.9; step += 0.06) {
      var candidate = mix(value, toward, step);
      if (contrast(candidate, background) >= target) return candidate;
    }
    return toward;
  };

  var visible = function (element) {
    var rect = element.getBoundingClientRect();
    var style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.1) return null;
    if (rect.width < 4 || rect.height < 4) return null;
    if (rect.bottom < 0 || rect.top > window.innerHeight * 3) return null;
    return rect;
  };

  var viewportArea = window.innerWidth * window.innerHeight;

  // 1. Backgrounds, weighted by painted area.
  var backgrounds = new Map();
  Array.prototype.slice.call(
    document.querySelectorAll("body, header, nav, main, section, article, aside, footer, div")
  ).slice(0, 900).forEach(function (element) {
    var rect = visible(element);
    if (!rect) return;
    var area = Math.max(0, Math.min(rect.width * rect.height, viewportArea * 2));
    if (area < viewportArea * 0.01) return;
    var color = parse(getComputedStyle(element).backgroundColor);
    if (!color) return;
    var key = hex(color);
    backgrounds.set(key, (backgrounds.get(key) || 0) + area);
  });

  var bodyStyle = getComputedStyle(document.body);
  var bodyBackground = parse(bodyStyle.backgroundColor);
  var htmlBackground = parse(getComputedStyle(document.documentElement).backgroundColor);
  var scheme = bodyStyle.colorScheme || getComputedStyle(document.documentElement).colorScheme || "";
  // A transparent body paints the canvas, which is white unless the page asks
  // for a dark colour-scheme. Guessing from cards here inverts the whole palette.
  var canvas = /dark/.test(scheme) ? "#121212" : "#ffffff";
  var rankedBackgrounds = Array.from(backgrounds.entries()).sort(function (a, b) { return b[1] - a[1]; });
  var background = bodyBackground ? hex(bodyBackground) : htmlBackground ? hex(htmlBackground) : canvas;

  // 2. Text colours, weighted by how much type they set.
  var textColors = new Map();
  Array.prototype.slice.call(
    document.querySelectorAll("h1, h2, h3, h4, p, span, a, li, button, label")
  ).slice(0, 1200).forEach(function (element) {
    var text = (element.textContent || "").trim();
    if (!text || text.length > 600) return;
    if (element.querySelector("h1, h2, h3, p")) return;
    if (!visible(element)) return;
    var color = parse(getComputedStyle(element).color);
    if (!color) return;
    var size = parseFloat(getComputedStyle(element).fontSize) || 16;
    var key = hex(color);
    textColors.set(key, (textColors.get(key) || 0) + Math.min(text.length, 220) * (size / 16));
  });

  var rankedText = Array.from(textColors.entries()).sort(function (a, b) { return b[1] - a[1]; });
  var textChoice = rankedText.length
    ? rankedText[0][0]
    : (luminance(background) > 0.45 ? "#111111" : "#f5f5f2");
  var text = readable(textChoice, background, 4.5);
  for (var i = 0; i < rankedText.length; i++) {
    if (contrast(rankedText[i][0], background) >= 4.5) { text = rankedText[i][0]; break; }
  }

  // 3. Surface: the next large background that is visibly distinct.
  var surface = null;
  var surfaceWeight = 0;
  rankedBackgrounds.forEach(function (entry) {
    var color = entry[0];
    if (color === background) return;
    var delta = Math.abs(luminance(color) - luminance(background));
    if (delta > 0.012 && delta < 0.24 && entry[1] > surfaceWeight) {
      surface = color;
      surfaceWeight = entry[1];
    }
  });
  surface = surface || mix(background, text, 0.07);

  // 4. Brand colours from buttons, links and filled controls.
  var brand = new Map();
  Array.prototype.slice.call(
    document.querySelectorAll('a, button, [role="button"], input[type="submit"], [class*="btn"], [class*="button"]')
  ).slice(0, 300).forEach(function (element) {
    var rect = visible(element);
    if (!rect) return;
    var style = getComputedStyle(element);
    var weight = Math.min(240, Math.max(20, rect.width * rect.height * 0.25));
    var fill = parse(style.backgroundColor);
    if (fill) brand.set(hex(fill), (brand.get(hex(fill)) || 0) + weight);
    var ink = parse(style.color);
    if (ink) brand.set(hex(ink), (brand.get(hex(ink)) || 0) + weight * 0.7);
    var border = parse(style.borderTopColor);
    if (border) brand.set(hex(border), (brand.get(hex(border)) || 0) + weight * 0.4);
  });

  var brandCandidates = Array.from(brand.entries())
    .filter(function (entry) { return saturation(entry[0]) >= 0.16 && contrast(entry[0], background) >= 2; })
    .sort(function (a, b) { return b[1] - a[1]; })
    .map(function (entry) { return entry[0]; });

  var primary = readable(
    brandCandidates[0] || (luminance(background) > 0.5 ? "#1f2937" : "#f4f2ec"),
    background,
    4.5
  );
  var accent = null;
  for (var j = 0; j < brandCandidates.length; j++) {
    var candidate = brandCandidates[j];
    if (candidate === primary) continue;
    if (Math.abs(luminance(candidate) - luminance(primary)) <= 0.08) continue;
    if (contrast(candidate, background) < 2.6) continue;
    accent = candidate;
    break;
  }
  accent = accent || readable(luminance(background) > 0.5 ? "#2563eb" : "#c8f751", background, 3);

  var distinct = function (color, fallback) {
    return color.toLowerCase() === background.toLowerCase() ? fallback : color;
  };
  var palette = {
    background: background,
    surface: surface,
    primary: distinct(primary, text),
    accent: distinct(accent, primary),
    text: text
  };

  var heading = document.querySelector("h1") || document.querySelector("h2");
  var metaContent = function (selector) {
    var node = document.querySelector(selector);
    return node && node.content ? String(node.content).trim() : "";
  };
  var firstFamily = function (value) {
    return String(value).split(",")[0].replace(/["']/g, "").trim() || "system-ui";
  };

  var seen = new Set();
  var blocks = [];
  Array.prototype.forEach.call(document.querySelectorAll("h1, h2, h3, p, li, blockquote"), function (element) {
    var value = (element.textContent || "").replace(/\s+/g, " ").trim();
    if (value.length < 24 || value.length > 600) return;
    var key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push(value);
  });

  return {
    title: document.title.trim().slice(0, 160),
    description: (metaContent('meta[name="description"]') || metaContent('meta[property="og:description"]')).slice(0, 400),
    headline: (heading ? heading.textContent || "" : "").replace(/\s+/g, " ").trim().slice(0, 180),
    text: blocks.join("\n").slice(0, 6000),
    palette: palette,
    fontDisplay: firstFamily(getComputedStyle(heading || document.body).fontFamily),
    fontBody: firstFamily(getComputedStyle(document.body).fontFamily)
  };
})()`;

async function captureWithBrowser(
  url: string,
  refresh: boolean,
  viewport: { width: number; height: number },
): Promise<SiteCapture> {
  if (!refresh) {
    const cached = await readCache(url, viewport);
    if (cached) return cached;
  }

  const target = await assertPublicUrl(url);
  await ensureBrowser({ chromeMode: "headless-shell" });
  const browser = await openBrowser("chrome", { chromeMode: "headless-shell", logLevel: "error" });

  try {
    const page = await browser.newPage({
      context: () => null,
      logLevel: "error",
      indent: false,
      pageIndex: 0,
      onBrowserLog: null,
      onLog: () => {},
    });
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });

    const response = await page.goto({ url: target.toString(), timeout: 20_000 });
    const status = response?.status() ?? 0;
    if (status >= 400) throw new Error(`The site responded with ${status}.`);

    // Redirects must stay on public hosts, or this becomes an SSRF primitive.
    const finalUrl = await assertPublicUrl(page.url());

    await page.evaluate(SETTLE_SCRIPT as never);
    const intel = (await page.evaluate(EXTRACT_SCRIPT as never)) as {
      title: string;
      description: string;
      headline: string;
      text: string;
      palette: Palette;
      fontDisplay: string;
      fontBody: string;
    };

    if (!intel?.palette || !/^#[0-9a-f]{6}$/i.test(intel.palette.background)) {
      throw new Error("No usable page styles were found.");
    }

    const shot = await page._client().send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 84,
      captureBeyondViewport: false,
    });

    const capture: SiteCapture = {
      url: finalUrl.toString(),
      title: intel.title || finalUrl.hostname,
      description: intel.description || "",
      headline: intel.headline || "",
      text: intel.text || "",
      palette: intel.palette,
      fontDisplay: intel.fontDisplay,
      fontBody: intel.fontBody,
      width: viewport.width,
      height: viewport.height,
      capturedAt: new Date().toISOString(),
      screenshot: Buffer.from(shot.value.data, "base64"),
    };

    if (!capture.screenshot.byteLength) throw new Error("The screenshot came back empty.");
    await writeCache(capture);
    return capture;
  } finally {
    await browser.close({ silent: true }).catch(() => {});
  }
}

export async function captureWebsite(url: string, options: { refresh?: boolean; aspect?: string } = {}) {
  return captureWithBrowser(url, Boolean(options.refresh), viewportFor(options.aspect ?? "16:9"));
}
