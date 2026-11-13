import { NextRequest } from "next/server";
import { ensureSfxLibrary, sfxFilePath } from "@/lib/sfx-library";
import { serveFile } from "@/lib/http";

export const runtime = "nodejs";

/** Only files that exist in the manifest can be served; no traversal, no uploads. */
export async function GET(request: NextRequest, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const absolute = sfxFilePath(file);
  if (!absolute) return new Response("Not found", { status: 404 });

  try {
    await ensureSfxLibrary();
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return serveFile(absolute, request, { cacheControl: "public, max-age=31536000, immutable" });
}
