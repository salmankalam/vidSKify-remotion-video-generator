import { NextRequest } from "next/server";
import { getProject, pushRevision, removeAsset, saveProject, storeAsset } from "@/lib/store";
import { applySiteLook } from "@/lib/ai/brief";
import { analyzeWebsite } from "@/lib/ai/site-intel";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Re-reads the project's website: palette, type and a fresh screenshot. Existing
 * site screenshots are replaced, never piled up, and the change is a revision so
 * it can be undone like any other edit.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return jsonError("Project not found", 404);

  const body = await request.json().catch(() => ({}));
  const url = String(body?.url ?? project.brief.url ?? "").trim();
  if (!url) {
    return jsonError("This project has no website yet. Add one when creating a video, or paste a URL.");
  }

  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    return jsonError("That does not look like a valid URL.");
  }

  try {
    const analysis = await analyzeWebsite(url, {
      refresh: body?.refresh !== false,
      aspect: project.spec.meta.aspect,
    });

    for (const asset of project.assets.filter((entry) => entry.origin === "site")) {
      await removeAsset(project, asset.id);
    }

    let screenshotAssetId: string | null = null;
    if (analysis.screenshot && analysis.screenshot.byteLength > 1024) {
      const asset = await storeAsset(project, {
        data: analysis.screenshot,
        filename: "site-screenshot.jpg",
        mime: "image/jpeg",
        kind: "image",
        origin: "site",
        width: analysis.width || 1440,
        height: analysis.height || 900,
      });
      screenshotAssetId = asset.id;
    }

    applySiteLook(project.spec, analysis.intel, screenshotAssetId);
    project.brief.url = url;
    pushRevision(project, `Analysed ${host}`);
    await saveProject(project);

    return Response.json({
      project,
      host,
      source: analysis.source,
      palette: analysis.intel.palette ?? null,
      fontPair: analysis.intel.fontPair ?? null,
      screenshot: Boolean(screenshotAssetId),
    });
  } catch (error: any) {
    return jsonError(`Could not analyse ${host}: ${error?.message ?? "unknown error"}`, 422);
  }
}
