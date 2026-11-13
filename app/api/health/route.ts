import { aiModel, hasAI } from "@/lib/ai/client";
import { hasSpeech } from "@/lib/ai/speech";

export const runtime = "nodejs";

const WORKER = process.env.RENDER_WORKER_URL || "http://127.0.0.1:4321";

export async function GET() {
  let worker: {
    ok: boolean;
    browserReady?: boolean;
    bundled?: boolean;
    active?: string | null;
  } = { ok: false };

  try {
    const response = await fetch(`${WORKER}/health`, { signal: AbortSignal.timeout(1500) });
    if (response.ok) worker = await response.json();
  } catch {
    /* worker offline */
  }

  return Response.json(
    {
      ai: hasAI(),
      model: hasAI() ? aiModel() : null,
      speech: hasSpeech(),
      worker,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
