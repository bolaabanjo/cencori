/* eslint-disable react/no-unescaped-entities */
"use client";

import { useRouter } from "next/navigation";
import React, { useState, use } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { slugify } from "@/lib/utils";
import { isReservedProjectSlug } from "@/lib/reserved-slugs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
}

// General region groups (auto-routing to nearest in group)
const GENERAL_REGIONS = [
  { value: "americas", label: "Americas", flag: "🌎", recommended: false },
  { value: "europe", label: "Europe", flag: "🌍", recommended: true },
  { value: "asia-pacific", label: "Asia-Pacific", flag: "🌏", recommended: false },
] as const;

// Specific regions with country flags and codes
const SPECIFIC_REGIONS = [
  { value: "us-east-1", label: "East US (N. Virginia)", code: "us-east-1", flag: "🇺🇸", recommended: true },
  { value: "us-west-1", label: "West US (N. California)", code: "us-west-1", flag: "🇺🇸", recommended: false },
  { value: "us-west-2", label: "West US (Oregon)", code: "us-west-2", flag: "🇺🇸", recommended: false },
  { value: "ca-central-1", label: "Canada (Central)", code: "ca-central-1", flag: "🇨🇦", recommended: false },
  { value: "eu-west-1", label: "West EU (Ireland)", code: "eu-west-1", flag: "🇮🇪", recommended: true },
  { value: "eu-central-1", label: "Central EU (Frankfurt)", code: "eu-central-1", flag: "🇩🇪", recommended: false },
  { value: "ap-southeast-1", label: "Southeast Asia (Singapore)", code: "ap-southeast-1", flag: "🇸🇬", recommended: false },
  { value: "ap-northeast-1", label: "Northeast Asia (Tokyo)", code: "ap-northeast-1", flag: "🇯🇵", recommended: false },
  { value: "ap-south-1", label: "South Asia (Mumbai)", code: "ap-south-1", flag: "🇮🇳", recommended: false },
  { value: "sa-east-1", label: "South America (São Paulo)", code: "sa-east-1", flag: "🇧🇷", recommended: false },
  { value: "me-south-1", label: "Middle East (Bahrain)", code: "me-south-1", flag: "🇧🇭", recommended: false },
  { value: "af-south-1", label: "Africa (Cape Town)", code: "af-south-1", flag: "🇿🇦", recommended: false },
] as const;

const formSchema = z.object({
  name: z.string().min(2, { message: "Project name must be at least 2 characters." }),
  description: z.string().optional(),
  region: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

// Hook to fetch org with caching
function useOrganization(orgSlug: string) {
  return useQuery({
    queryKey: ["organization", orgSlug],
    queryFn: async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      const { data: orgData, error: fetchError } = await supabase
        .from("organizations")
        .select("id, name, slug, subscription_tier")
        .eq("slug", orgSlug)
        .eq("owner_id", user.id)
        .single();

      if (fetchError || !orgData) throw new Error("Organization not found or you don't have permission.");
      return orgData as OrganizationData;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

export default function NewProjectPage({ params }: PageProps) {
  const { orgSlug } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Fetch org with caching - INSTANT ON REVISIT!
  const { data: organization, isLoading: orgLoading, error: orgError } = useOrganization(orgSlug);
  const { refetchData } = useOrganizationProject();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      region: "auto",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("You must be logged in to create a project.");
      setLoading(false);
      return;
    }

    if (!organization) {
      toast.error("Organization data is not loaded yet. Please try again.");
      setLoading(false);
      return;
    }

    // Enforce free tier project limit
    const tier = organization.subscription_tier || 'free';
    if (tier === 'free') {
      const { count } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization.id);
      if ((count ?? 0) >= 1) {
        setLoading(false);
        setUpgradeOpen(true);
        return;
      }
    }

    const baseSlug = slugify(values.name) || "project";
    let newSlug = baseSlug;
    let slugExists = true;

    for (let i = 0; i < 20; i++) {
      // Skip slugs that would collide with an org-level route.
      if (isReservedProjectSlug(newSlug)) {
        newSlug = `${baseSlug}-${i + 2}`;
        continue;
      }
      const { data } = await supabase
        .from("projects")
        .select("slug")
        .eq("organization_id", organization.id)
        .eq("slug", newSlug)
        .single();

      if (!data) {
        slugExists = false;
        break;
      }
      newSlug = `${baseSlug}-${i + 2}`;
    }

    if (slugExists) {
      toast.error("Could not generate a unique project slug. Please try a different name.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("projects").insert({
      name: values.name,
      slug: newSlug,
      description: values.description || null,
      organization_id: organization.id,
      visibility: "private",
      region: values.region,
    });

    if (error) {
      console.error("Error creating project:", error.message);
      toast.error("Failed to create project. " + error.message);
    } else {
      toast.success("Project created successfully!");
      // Refresh breadcrumb data + invalidate projects-list cache so the
      // new project shows up immediately on /{org}/~/projects.
      await refetchData();
      await queryClient.invalidateQueries({ queryKey: ["orgProjects", orgSlug] });
      router.push(`/${orgSlug}/${newSlug}`);
    }
    setLoading(false);
  };

  if (orgLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="bg-card border border-border/40 rounded-md">
          {[1, 2, 3].map((i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-2 md:gap-6 p-4 border-b border-border/40 last:border-b-0">
              <Skeleton className="h-3 w-12" />
              <div className="space-y-1.5">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-2.5 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (orgError) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xs text-red-500">{orgError.message}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-base font-medium mb-1">Create a new project</h1>
        <p className="text-xs text-muted-foreground">
          Projects contain API keys and configurations for your AI integrations in {organization?.name}.
        </p>
      </div>

      {/* Form Card */}
      <div className="bg-card border border-border/40 rounded-md">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          {/* Name Field */}
          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-2 md:gap-6 p-4 border-b border-border/40">
            <label htmlFor="name" className="text-xs font-medium pt-2">
              Name
            </label>
            <div className="space-y-1.5">
              <Input
                id="name"
                placeholder="Project name"
                autoComplete="off"
                className="h-8 text-xs bg-secondary/50 border-border/50"
                {...form.register("name")}
              />
              <p className="text-[11px] text-muted-foreground">
                What's the name of your project? You can change this later.
              </p>
              {form.formState.errors.name && (
                <p className="text-[11px] text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>
          </div>

          {/* Description Field */}
          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-2 md:gap-6 p-4 border-b border-border/40">
            <label htmlFor="description" className="text-xs font-medium pt-2">
              Description
            </label>
            <div className="space-y-1.5">
              <Input
                id="description"
                placeholder="A brief description (optional)"
                autoComplete="off"
                className="h-8 text-xs bg-secondary/50 border-border/50"
                {...form.register("description")}
              />
              <p className="text-[11px] text-muted-foreground">
                Optional description to help identify this project.
              </p>
            </div>
          </div>

          {/* Region Field */}
          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-2 md:gap-6 p-4">
            <label htmlFor="region" className="text-xs font-medium pt-2">
              Region
            </label>
            <div className="space-y-1.5">
              <Select
                onValueChange={(value: string) => form.setValue("region", value)}
                defaultValue={form.getValues("region")}
              >
                <SelectTrigger id="region" className="h-8 text-xs bg-secondary/50 border-border/50">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent className="max-h-80 w-[340px]">
                  {/* General Regions Group */}
                  <div className="px-2 py-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      General Regions
                    </span>
                  </div>
                  {GENERAL_REGIONS.map((region) => (
                    <SelectItem key={region.value} value={region.value} className="text-xs py-2">
                      <div className="flex items-center justify-between w-full gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{region.flag}</span>
                          <span>{region.label}</span>
                        </div>
                        {region.recommended && (
                          <span className="text-[9px] font-medium text-emerald-500 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}

                  {/* Divider */}
                  <div className="my-1 border-t border-border/40" />

                  {/* Specific Regions Group */}
                  <div className="px-2 py-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Specific Regions
                    </span>
                  </div>
                  {SPECIFIC_REGIONS.map((region) => (
                    <SelectItem key={region.value} value={region.value} className="text-xs py-2">
                      <div className="flex items-center justify-between w-full gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{region.flag}</span>
                          <span>{region.label}</span>
                          <span className="text-muted-foreground font-mono text-[10px]">{region.code}</span>
                        </div>
                        {region.recommended && (
                          <span className="text-[9px] font-medium text-emerald-500 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Select the edge region for your AI requests.{" "}
                <Link href="/docs/concepts/regions" className="text-primary hover:underline">
                  Learn more
                </Link>
              </p>
            </div>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-3"
          onClick={() => router.push(`/${orgSlug}/~/projects`)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-7 text-xs px-4"
          disabled={loading}
          onClick={form.handleSubmit(onSubmit)}
        >
          {loading ? "Creating..." : "Create project"}
        </Button>
      </div>

      {/* Upgrade dialog — shown when free plan project limit is hit */}
      {organization && (
        <UpgradeDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          orgId={organization.id}
          orgSlug={orgSlug}
          reason="Your free plan is limited to 1 project. Upgrade to Pro for unlimited projects."
          recommendedTier="pro"
        />
      )}
    </div>
  );
}
