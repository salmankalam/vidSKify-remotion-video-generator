import { NextRequest } from "next/server";
import { getProject, pushRevision, saveProject } from "@/lib/store";
import { normalizeSpec } from "@/lib/spec";
import { editSpec } from "@/lib/ai/edit";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return jsonError("Project not found", 404);

  const body = await request.json().catch(() => null);
  const instruction = String(body?.instruction ?? "").trim().slice(0, 1200);
  if (!instruction) return jsonError("Tell the AI what to change.");

  // Take the caller's spec so unsaved UI edits are what gets revised.
  const base = body?.spec ? normalizeSpec(body.spec, project.spec.meta.aspect) : project.spec;

  try {
    const imageAssetIds = project.assets.filter((asset) => asset.kind === "image").map((asset) => asset.id);
    const result = await editSpec({ spec: base, instruction, imageAssetIds });

    project.spec = base;
    pushRevision(project, `AI · ${instruction.slice(0, 80)}`);
    project.spec = result.spec;
    project.name = result.spec.meta.title || project.name;
    await saveProject(project);

    return Response.json({ spec: project.spec, note: result.note, project });
  } catch (error: any) {
    return jsonError(error?.message ?? "The AI edit failed.", error?.status === 401 ? 401 : 500);
  }
}
