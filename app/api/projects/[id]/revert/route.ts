import { NextRequest } from "next/server";
import { getProject, pushRevision, saveProject } from "@/lib/store";
import { normalizeSpec } from "@/lib/spec";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return jsonError("Project not found", 404);

  const body = await request.json().catch(() => null);
  const revisionId = String(body?.revisionId ?? project.revisions[0]?.id ?? "");
  const revision = project.revisions.find((entry) => entry.id === revisionId);
  if (!revision) return jsonError("That version is no longer available.", 404);

  pushRevision(project, "Before revert");
  project.spec = normalizeSpec(revision.spec, project.spec.meta.aspect);
  await saveProject(project);
  return Response.json(project);
}
