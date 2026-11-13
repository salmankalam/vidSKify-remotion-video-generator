import { NextRequest } from "next/server";
import { deleteProject, getProject, saveProject } from "@/lib/store";
import { normalizeSpec } from "@/lib/spec";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return jsonError("Project not found", 404);
  return Response.json(project, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return jsonError("Project not found", 404);

  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  if (body.spec) {
    project.spec = normalizeSpec(body.spec, project.spec.meta.aspect);
    project.name = project.spec.meta.title || project.name;
  }
  if (typeof body.name === "string" && body.name.trim()) {
    project.name = body.name.trim().slice(0, 140);
  }

  await saveProject(project);
  return Response.json(project);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ok = await deleteProject(id);
  if (!ok) return jsonError("Project not found", 404);
  return Response.json({ ok: true });
}
