import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { mimeForFilename } from "./store";

/**
 * Streams a local file with Range support so <audio>/<video> can seek, and
 * optional attachment headers for downloads.
 */
export async function serveFile(
  filePath: string,
  request: Request,
  options: { downloadName?: string | null; cacheControl?: string } = {},
): Promise<Response> {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!fileStat.isFile()) return new Response("Not found", { status: 404 });

  const size = fileStat.size;
  const headers = new Headers({
    "content-type": mimeForFilename(filePath),
    "accept-ranges": "bytes",
    "cache-control": options.cacheControl ?? "no-store",
    "last-modified": fileStat.mtime.toUTCString(),
  });
  if (options.downloadName) {
    headers.set(
      "content-disposition",
      `attachment; filename="${options.downloadName.replace(/["\\]/g, "")}"`,
    );
  }

  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      let start = match[1] ? Number(match[1]) : 0;
      let end = match[2] ? Number(match[2]) : size - 1;
      if (!match[1] && match[2]) {
        const suffix = Number(match[2]);
        start = Math.max(0, size - suffix);
        end = size - 1;
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${size}` },
        });
      }
      end = Math.min(end, size - 1);
      headers.set("content-range", `bytes ${start}-${end}/${size}`);
      headers.set("content-length", String(end - start + 1));
      const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
      return new Response(stream, { status: 206, headers });
    }
  }

  headers.set("content-length", String(size));
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { status: 200, headers });
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
