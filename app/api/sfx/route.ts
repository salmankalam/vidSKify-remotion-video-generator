import { ensureSfxLibrary } from "@/lib/sfx-library";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const manifest = await ensureSfxLibrary();
    return Response.json(manifest, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error: any) {
    return jsonError(`Could not build the sound library: ${error?.message ?? "unknown error"}`, 500);
  }
}
