import { notFound } from "next/navigation";
import Editor from "@/components/Editor";
import { getProject } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return <Editor initialProject={project} />;
}
