import { NextRequest } from "next/server";
import { assetPath, isSafeFilename, isSafeId } from "@/lib/store";
import { jsonError, serveFile } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; file: string }> },
) {
  const { projectId, file } = await context.params;
  if (!isSafeId(projectId) || !isSafeFilename(file)) return jsonError("Not found", 404);
  return serveFile(assetPath(projectId, file), request, {
    cacheControl: "public, max-age=31536000, immutable",
  });
}
