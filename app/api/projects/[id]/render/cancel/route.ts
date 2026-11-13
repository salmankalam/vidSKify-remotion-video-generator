import { NextRequest } from "next/server";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

const WORKER = process.env.RENDER_WORKER_URL || "http://127.0.0.1:4321";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const response = await fetch(`${WORKER}/render/${id}/cancel`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch {
    return jsonError("The render worker is not running.", 503);
  }
}
