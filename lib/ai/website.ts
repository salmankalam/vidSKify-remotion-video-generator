import { promises as dns } from "node:dns";
import * as cheerio from "cheerio";
import type { FontPair, Palette } from "../spec";

const SERIF = /playfair|georgia|times|garamond|baskerville|merriweather|lora|freight|tiempos|canela|serif/i;
const DISPLAY = /anton|impact|oswald|bebas|archivo black|condensed|narrow|poster|druk/i;

/**
 * We ship three licensed webfont pairs, so a detected family is mapped to the
 * closest one rather than redistributing the site's own fonts.
 */
export function fontPairFor(display: string, body: string): FontPair {
  if (DISPLAY.test(`${display} ${body}`)) return "bold";
  // Check the display face only: the generic body fallback is usually
  // "sans-serif", whose name would otherwise match /serif/.
  if (display && !/sans/i.test(display) && SERIF.test(display)) return "editorial";
  if (!display && SERIF.test(body) && !/sans/i.test(body)) return "editorial";
  return "modern";
}

export type WebsiteSummary = {
  url: string;
  title: string;
  description: string;
  text: string;
  /** Real colours read from the rendered page, when the browser capture ran. */
  palette?: Palette;
  fontFamily?: string;
  fontPair?: FontPair;
};

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function isPrivateAddress(address: string) {
  if (address.includes(":")) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.replace("::ffff:", ""));
    return false;
  }
  return PRIVATE_V4.some((pattern) => pattern.test(address));
}

/** SSRF guard: only public http(s) hosts, validated at every redirect hop. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That does not look like a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https links can be analysed.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Local network addresses cannot be analysed.");
  }
  const addresses = /^[\d.]+$/.test(host) || host.includes(":")
    ? [{ address: host }]
    : await dns.lookup(host, { all: true, verbatim: true }).catch(() => {
        throw new Error("That website could not be resolved.");
      });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Private or internal addresses cannot be analysed.");
  }
  return url;
}

async function readLimited(response: Response, maxBytes = 900_000): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  reader.cancel().catch(() => {});
  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.byteLength + offset > maxBytes ? chunk.slice(0, maxBytes - offset) : chunk;
    merged.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= maxBytes) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export async function summarizeWebsite(rawUrl: string): Promise<WebsiteSummary> {
  let current = await assertPublicUrl(rawUrl);

  let html = "";
  let finalUrl = current.toString();

  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; FrameStudio/0.1; +local)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en",
      },
      signal: AbortSignal.timeout(9_000),
    }).catch(() => {
      throw new Error("That website took too long to respond.");
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The website redirected without a destination.");
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`The website responded with ${response.status}.`);

    html = await readLimited(response);
    finalUrl = current.toString();
    break;
  }

  if (!html) throw new Error("The website returned no readable content.");

  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, form, nav footer").remove();

  const title =
    ($('meta[property="og:title"]').attr("content") || $("title").first().text() || "").trim().slice(0, 160);
  const description = (
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    ""
  )
    .trim()
    .slice(0, 400);

  const seen = new Set<string>();
  const blocks: string[] = [];
  $("h1, h2, h3, p, li").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text.length < 24 || text.length > 600) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push(text);
  });

  const text = blocks.join("\n").slice(0, 6000);
  if (!title && !text) throw new Error("No readable copy was found on that page.");

  return { url: finalUrl, title, description, text };
}
