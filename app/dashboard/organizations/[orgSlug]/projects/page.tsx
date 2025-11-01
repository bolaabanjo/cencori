"use client";

import { supabase as browserSupabase } from "@/lib/supabaseClient"; // Use browser client
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { notFound, redirect } from "next/navigation";
import { Home as HomeIcon } from "lucide-react";
import { useBreadcrumbs } from "@/lib/contexts/BreadcrumbContext";
import { useEffect, useState } from "react"; // Import useState

export default function OrgProjectsPage({ params }: { params: { orgSlug: string } }) {
  const { orgSlug } = params;
  const { setBreadcrumbs } = useBreadcrumbs();
  const [organization, setOrganization] = useState<any | null>(null);
  const [projects, setProjects] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgAndProjects = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user }, error: userError } = await browserSupabase.auth.getUser();

        if (userError || !user) {
          redirect("/login");
          return;
        }

        // Fetch organization details
        const { data: orgData, error: orgError } = await browserSupabase
          .from("organizations")
          .select("id, name, slug")
          .eq("slug", orgSlug)
          .eq("owner_id", user.id)
          .single();

        if (orgError || !orgData) {
          console.error("Error fetching organization:", orgError?.message);
          notFound();
          return;
        }
        setOrganization(orgData);

        // Set breadcrumbs
        setBreadcrumbs([
          { label: "Organizations", href: "/dashboard/organizations" },
          { label: orgData.name, href: `/dashboard/organizations/${orgSlug}/projects` },
          { label: "Projects" },
        ]);

        // Fetch projects for the organization
        const { data: projectsData, error: projectsError } = await browserSupabase
          .from("projects")
          .select("id, name, slug, description")
          .eq("organization_id", orgData.id);

        if (projectsError) {
          console.error("Error fetching projects:", projectsError.message);
          setError("Error loading projects.");
          return;
        }
        setProjects(projectsData);

      } catch (err: any) {
        console.error("Unexpected error:", err.message);
        setError("An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchOrgAndProjects();
  }, [orgSlug, setBreadcrumbs]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl">Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl text-red-500">{error}</p>
      </div>
    );
  }

  if (!organization) {
    // Should theoretically be caught by notFound() above, but as a safeguard
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl text-red-500">Organization not found.</p>
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
