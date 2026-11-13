import { NextRequest } from "next/server";
import { getProject, removeAsset, saveProject } from "@/lib/store";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await context.params;
  const project = await getProject(id);
  if (!project) return jsonError("Project not found", 404);

  await removeAsset(project, assetId);
  await saveProject(project);
  return Response.json(project);
}
