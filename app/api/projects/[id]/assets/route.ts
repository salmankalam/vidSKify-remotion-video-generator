import { NextRequest } from "next/server";
import { getProject, saveProject, storeAsset } from "@/lib/store";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return jsonError("Project not found", 404);

  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("Could not read the upload.");

  const requestedKind = String(form.get("kind") ?? "image");
  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (!files.length) return jsonError("No files uploaded.");

  for (const file of files) {
    const isAudio = file.type.startsWith("audio/");
    const isImage = file.type.startsWith("image/");
    if (!isAudio && !isImage) return jsonError(`${file.name}: only images and audio are supported.`);

    const kind = isAudio ? "music" : "image";
    if (requestedKind === "music" && !isAudio) return jsonError("Choose an audio file for the soundtrack.");
    if (requestedKind === "image" && !isImage) return jsonError("Choose an image file.");

    if (isImage && file.size > MAX_IMAGE_BYTES) return jsonError(`${file.name} is larger than 10MB.`);
    if (isAudio && file.size > MAX_AUDIO_BYTES) return jsonError(`${file.name} is larger than 30MB.`);

    const data = Buffer.from(await file.arrayBuffer());
    const asset = await storeAsset(project, {
      data,
      filename: file.name || (isAudio ? "track.mp3" : "image.png"),
      mime: file.type,
      kind,
    });
    if (kind === "music") project.spec.audio.musicAssetId = asset.id;
  }

  await saveProject(project);
  return Response.json(project);
}
