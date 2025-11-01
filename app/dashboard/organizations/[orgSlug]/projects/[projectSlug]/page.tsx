"use client";

import { supabase as browserSupabase } from "@/lib/supabaseClient"; // Use browser client
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Home as HomeIcon } from "lucide-react";
import { useBreadcrumbs } from "@/lib/contexts/BreadcrumbContext";
import { useEffect, useState } from "react";

export default function ProjectDetailsPage({
  params,
}: { 
  params: { orgSlug: string; projectSlug: string };
}) {
  const { orgSlug, projectSlug } = params;
  const { setBreadcrumbs } = useBreadcrumbs();
  const [organization, setOrganization] = useState<any | null>(null);
  const [project, setProject] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjectDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user }, error: userError } = await browserSupabase.auth.getUser();

        if (userError || !user) {
          redirect("/login");
          return;
        }

        // Fetch organization to ensure the user has access and get organization_id
        const { data: orgData, error: orgError } = await browserSupabase
          .from("organizations")
          .select("id, name, slug")
          .eq("slug", orgSlug)
          .eq("owner_id", user.id)
          .single();

        if (orgError || !orgData) {
          console.error("Error fetching organization in project details page:", orgError?.message);
          notFound();
          return;
        }
        setOrganization(orgData);

        // Fetch project details
        const { data: projectData, error: projectError } = await browserSupabase
          .from("projects")
          .select("id, name, slug, description, created_at")
          .eq("organization_id", orgData.id)
          .eq("slug", projectSlug)
          .single();

        if (projectError || !projectData) {
          console.error("Error fetching project:", projectError?.message);
          notFound();
          return;
        }
        setProject(projectData);

        // Set breadcrumbs
        setBreadcrumbs([
          { label: "Organizations", href: "/dashboard/organizations" },
          { label: orgData.name, href: `/dashboard/organizations/${orgSlug}/projects` },
          { label: "Projects", href: `/dashboard/organizations/${orgSlug}/projects` },
          { label: projectData.name },
        ]);

      } catch (err: any) {
        console.error("Unexpected error:", err.message);
        setError("An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchProjectDetails();
  }, [orgSlug, projectSlug, setBreadcrumbs]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl">Loading project details...</p>
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

  if (!organization || !project) {
    // Should theoretically be caught by notFound() above, but as a safeguard
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl text-red-500">Project or Organization not found.</p>
      </div>
    );
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
