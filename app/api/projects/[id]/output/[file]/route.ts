import { NextRequest } from "next/server";
import path from "node:path";
import { outputDir, isSafeId, isSafeFilename } from "@/lib/store";
import { jsonError, serveFile } from "@/lib/http";

export const runtime = "nodejs";

const ALLOWED = new Set(["video.mp4", "poster.jpg"]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await context.params;
  if (!isSafeId(id) || !isSafeFilename(file) || !ALLOWED.has(file)) {
    return jsonError("Not found", 404);
  }
  const download = file === "video.mp4" && request.nextUrl.searchParams.get("download") === "1";
  return serveFile(path.join(outputDir(id), file), request, {
    downloadName: download ? "frame-video.mp4" : null,
    cacheControl: "no-store",
  });
}
