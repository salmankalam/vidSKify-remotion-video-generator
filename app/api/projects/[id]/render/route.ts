import { NextRequest } from "next/server";
import { getProject } from "@/lib/store";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

const WORKER = process.env.RENDER_WORKER_URL || "http://127.0.0.1:4321";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return jsonError("Project not found", 404);

  try {
    const response = await fetch(`${WORKER}/render/${id}`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return jsonError(payload.error ?? "The render worker refused the job.", 502);
    return Response.json(payload);
  } catch {
    return jsonError(
      "The render worker is not running. Start it with `npm run dev` (or `npm run dev:worker`).",
      503,
    );
  }
}
