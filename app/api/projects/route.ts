import { listProjects, summarize } from "@/lib/store";
import { aiModel, hasAI } from "@/lib/ai/client";

export const runtime = "nodejs";

export async function GET() {
  const projects = await listProjects();
  return Response.json(
    { projects: projects.map(summarize), ai: hasAI(), model: hasAI() ? aiModel() : null },
    { headers: { "cache-control": "no-store" } },
  );
}
