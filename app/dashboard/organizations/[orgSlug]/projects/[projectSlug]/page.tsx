import { createServerClient } from "@/lib/supabaseServer";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProjectDetailsPage({
  params,
}: { 
  params: { orgSlug: string; projectSlug: string };
}) {
  const { orgSlug, projectSlug } = params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch organization to ensure the user has access and get organization_id
  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .eq("owner_id", user.id) // Ensure only owner can view
    .single();

  if (orgError || !organization) {
    console.error("Error fetching organization:", orgError?.message);
    notFound();
  }

  // Fetch project details
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, slug, description, created_at")
    .eq("organization_id", organization.id)
    .eq("slug", projectSlug)
    .single();

  if (projectError || !project) {
    console.error("Error fetching project:", projectError?.message);
    notFound();
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{project.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
          <CardDescription>Information about this project.</CardDescription>
        </CardHeader>
        <CardContent>
          <p><strong>Organization:</strong> {organization.name}</p>
          <p><strong>Slug:</strong> {project.slug}</p>
          <p><strong>Description:</strong> {project.description || "No description provided."}</p>
          <p><strong>Created At:</strong> {new Date(project.created_at).toLocaleDateString()}</p>
          {/* Add more project details as needed */}
        </CardContent>
      </Card>
    </div>
  );
}
