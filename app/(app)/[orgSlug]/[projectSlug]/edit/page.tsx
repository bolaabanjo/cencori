 
"use client";

import React, { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";

const formSchema = z.object({
  name: z.string().min(2, { message: "Project name must be at least 2 characters." }),
  description: z.string().optional(),
  visibility: z.enum(["private", "public"]),
  status: z.enum(["active", "inactive"]),
});

type FormValues = z.infer<typeof formSchema>;

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  visibility: 'private' | 'public';
  status: 'active' | 'inactive';
}

interface PageProps {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}

// Hook to fetch project with caching
function useProjectForEdit(orgSlug: string, projectSlug: string) {
  return useQuery({
    queryKey: ["projectEdit", orgSlug, projectSlug],
    queryFn: async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .eq("owner_id", user.id)
        .single();

      if (orgError || !orgData) throw new Error("Organization not found or you don't have permission.");

      const { data: projectData, error: fetchError } = await supabase
        .from("projects")
        .select("id, name, slug, description, visibility, status")
        .eq("organization_id", orgData.id)
        .eq("slug", projectSlug)
        .single();

      if (fetchError || !projectData) throw new Error("Project not found or you don't have permission.");
      return projectData as ProjectData;
    },
    staleTime: 60 * 1000,
  });
}

export default function EditProjectPage({ params }: PageProps) {
  const { orgSlug, projectSlug } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const { updateProject: updateProjectContext } = useOrganizationProject();

  // Fetch project with caching
  const { data: project, isLoading, error } = useProjectForEdit(orgSlug, projectSlug);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: project ? {
      name: project.name,
      description: project.description || "",
      visibility: project.visibility,
      status: project.status,
    } : undefined,
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("You must be logged in to update a project.");
      setSubmitting(false);
      return;
    }

    if (!project) {
      toast.error("Project data not loaded.");
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase.from("projects").update({
      name: values.name,
      description: values.description,
      visibility: values.visibility,
      status: values.status,
    }).eq("id", project.id);

    if (updateError) {
      console.error("Error updating project:", updateError.message);
      toast.error("Failed to update project: " + updateError.message);
    } else {
      toast.success("Project updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["projectEdit", orgSlug, projectSlug] });
      updateProjectContext(project.id, { name: values.name, description: values.description });
      router.push(`/${orgSlug}/${projectSlug}`);
    }
    setSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl">Loading project...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl text-red-500">{error.message}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl text-red-500">Project data not available.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center mt-12 h-full">
      <Card className="w-[550px]">
        <CardHeader>
          <CardTitle>Edit Project: {project.name}</CardTitle>
          <CardDescription>Update the details for this project.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                placeholder="My Awesome Project"
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-red-500 text-sm">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="A brief description of my project"
                {...form.register("description")}
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="visibility">Visibility</Label>
              <Select onValueChange={(value) => form.setValue("visibility", value as FormValues["visibility"])} value={form.watch("visibility")}>
                <SelectTrigger id="visibility">
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.visibility && (
                <p className="text-red-500 text-sm">{form.formState.errors.visibility.message}</p>
              )}
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select onValueChange={(value) => form.setValue("status", value as FormValues["status"])} value={form.watch("status")}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.status && (
                <p className="text-red-500 text-sm">{form.formState.errors.status.message}</p>
              )}
            </div>
            <div className="flex justify-between items-center mt-4">
              <Button type="button" variant="outline" onClick={() => router.push(`/${orgSlug}/${projectSlug}`)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Updating..." : "Update Project"}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          Project details are essential for team collaboration.
        </CardFooter>
      </Card>
    </div>
  );
}
