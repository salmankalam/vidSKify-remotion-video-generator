import { NextRequest } from "next/server";
import { createProject, pushRevision, saveProject, storeAsset } from "@/lib/store";
import { defaultSpec, type Aspect } from "@/lib/spec";
import { specFromBrief } from "@/lib/ai/brief";
import { analyzeWebsite, type SiteIntel } from "@/lib/ai/site-intel";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGES = 4;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Could not read the form. Try smaller images.");
  }

  const brief = String(form.get("brief") ?? "").slice(0, 8000).trim();
  const rawUrl = String(form.get("url") ?? "").trim().slice(0, 500);
  const aspect: Aspect = String(form.get("aspect")) === "9:16" ? "9:16" : "16:9";

  if (!brief && !rawUrl) {
    return jsonError("Describe your vision or add a website to analyse.");
  }

  const warnings: string[] = [];
  let website: SiteIntel | null = null;
  let screenshot: Buffer | null = null;
  let screenshotSize = { width: 1440, height: 900 };

  if (rawUrl) {
    try {
      const analysis = await analyzeWebsite(rawUrl, { aspect });
      website = analysis.intel;
      screenshot = analysis.screenshot;
      if (analysis.width && analysis.height) {
        screenshotSize = { width: analysis.width, height: analysis.height };
      }
      if (analysis.source === "html") {
        warnings.push("Read the page text only — the browser capture was unavailable.");
      }
    } catch (error: any) {
      warnings.push(`Could not read ${rawUrl}: ${error?.message ?? "unknown error"}`);
    }
  }

  const project = await createProject({
    name: brief.slice(0, 60) || website?.title || "Untitled video",
    brief: { text: brief, url: rawUrl, notes: "" },
    spec: defaultSpec(aspect),
  });

  const files = form.getAll("images").filter((entry): entry is File => entry instanceof File);
  const images: { assetId: string; dataUrl: string }[] = [];
  for (const file of files.slice(0, MAX_IMAGES)) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_IMAGE_BYTES) {
      warnings.push(`${file.name} is larger than 6MB and was skipped.`);
      continue;
    }
    const data = Buffer.from(await file.arrayBuffer());
    const asset = await storeAsset(project, {
      data,
      filename: file.name || "reference.png",
      mime: file.type,
      kind: "image",
    });
    images.push({ assetId: asset.id, dataUrl: `data:${file.type};base64,${data.toString("base64")}` });
  }
  if (files.length > MAX_IMAGES) {
    warnings.push(`Only the first ${MAX_IMAGES} reference images were used.`);
  }

  // The captured screenshot becomes a normal image asset, so it can be moved,
  // replaced or removed in the editor like any other photo.
  let screenshotAsset: { assetId: string; dataUrl: string } | null = null;
  if (screenshot && screenshot.byteLength > 1024) {
    const asset = await storeAsset(project, {
      data: screenshot,
      filename: "site-screenshot.jpg",
      mime: "image/jpeg",
      kind: "image",
      origin: "site",
      width: screenshotSize.width,
      height: screenshotSize.height,
    });
    screenshotAsset = {
      assetId: asset.id,
      dataUrl: `data:image/jpeg;base64,${screenshot.toString("base64")}`,
    };
  }

  const result = await specFromBrief({
    brief,
    aspect,
    images,
    website,
    screenshot: screenshotAsset,
  });
  project.spec = result.spec;
  project.name = result.spec.meta.title;
  project.brief.notes = [warnings.join(" "), result.warning ?? ""].filter(Boolean).join(" ").slice(0, 1000);
  pushRevision(
    project,
    result.source === "ai"
      ? website?.palette
        ? "AI draft with site palette"
        : "AI first draft"
      : "Rule-based first draft",
  );
  await saveProject(project);

  return Response.json({
    id: project.id,
    source: result.source,
    site: website ? { host: new URL(website.url).hostname, captured: Boolean(screenshotAsset) } : null,
    warnings: [warnings.join(" "), result.warning].filter(Boolean),
  });
}
