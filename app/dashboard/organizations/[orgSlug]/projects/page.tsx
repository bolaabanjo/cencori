import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { notFound, redirect } from "next/navigation";

export default async function OrgProjectsPage({ params }: { params: { orgSlug: string } }) {
  const { orgSlug } = params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch organization details
  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug, description")
    .eq("slug", orgSlug)
    .eq("owner_id", user.id) // Ensure only owner can view
    .single();

  if (orgError || !organization) {
    console.error("Error fetching organization:", orgError?.message);
    notFound();
  }

  // Fetch projects for the organization
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, slug, description")
    .eq("organization_id", organization.id);

  if (projectsError) {
    console.error("Error fetching projects:", projectsError.message);
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl text-red-500">Error loading projects.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Projects for {organization.name}</h1>
        <Button asChild>
          <Link href={`/dashboard/organizations/${orgSlug}/projects/new`}>
            Create New Project
          </Link>
        </Button>
      </div>

      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>{project.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="mt-4">
                  <Link href={`/dashboard/organizations/${orgSlug}/projects/${project.slug}`}>
                    View Project
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center p-10 border rounded-lg">
          <p className="text-xl mb-4">No projects found for {organization.name}.</p>
          <Button asChild>
            <Link href={`/dashboard/organizations/${orgSlug}/projects/new`}>
              Create Your First Project
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
