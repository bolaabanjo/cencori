import { DeveloperQuickstart } from "@/components/dashboard/project-overview/DeveloperQuickstart";

export default async function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}) {
  const { orgSlug, projectSlug } = await params;

  return (
    <DeveloperQuickstart orgSlug={orgSlug} projectSlug={projectSlug} />
  );
}
