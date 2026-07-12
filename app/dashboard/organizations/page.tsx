"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Search, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  subscription_tier?: 'free' | 'pro' | 'team' | 'enterprise' | null;
  plan_id: string;
  organization_plans: { name: string }[] | null;
  projects?: { count: number }[];
}

// Hook to fetch all organizations with caching
function useOrganizations() {
  const router = useRouter();

  return useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data: orgsData, error: fetchError } = await supabase
        .from("organizations")
        .select("id, name, slug, description, subscription_tier, plan_id, organization_plans(name), projects(count)");

      if (fetchError) throw new Error("Error loading organizations.");

      // Redirect to new org page if no orgs
      if (orgsData && orgsData.length === 0) {
        router.push("/dashboard/organizations/new");
      }

      return orgsData as OrganizationData[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function OrganizationsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Fetch orgs with caching - INSTANT ON REVISIT!
  const { data: organizations, isLoading, error } = useOrganizations();

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto px-6 py-8">
        {/* Header Skeleton */}
        <div className="mb-8">
          <Skeleton className="h-6 w-36" />
        </div>

        {/* Search and Button Skeleton */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-7 w-28" />
        </div>

        {/* Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-3 rounded-md bg-zinc-100 dark:bg-zinc-800/60"
            >
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-sm text-red-500">{error.message}</p>
      </div>
    );
  }

  if (!organizations || organizations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <div className="w-10 h-10 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
          <Building2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-sm font-medium mb-1">No organizations yet</h2>
        <p className="text-xs text-muted-foreground mb-3 max-w-[200px]">
          Create your first organization to start managing projects.
        </p>
        <Button asChild size="sm" className="h-7 text-xs px-3">
          <Link href="/dashboard/organizations/new">
            Create Organization
          </Link>
        </Button>
      </div>
    );
  }

  const filteredOrganizations = organizations.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProjectCount = (org: OrganizationData): number => {
    if (org.projects && org.projects.length > 0) {
      return org.projects[0]?.count ?? 0;
    }
    return 0;
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-base font-medium">
          Your Organizations
        </h1>
      </div>

      {/* Search and Actions - Small with breathing room */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search for an organization..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-48 sm:w-56 h-7 pl-7 text-xs rounded border-border/50 bg-transparent placeholder:text-muted-foreground/60"
          />
        </div>
        <Button asChild size="sm" className="h-7 text-xs px-3">
          <Link href="/dashboard/organizations/new">
            New organization
          </Link>
        </Button>
      </div>

      {/* Organizations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredOrganizations.map((org) => {
          const projectCount = getProjectCount(org);
          const planName =
            org.subscription_tier
              ? org.subscription_tier.charAt(0).toUpperCase() + org.subscription_tier.slice(1)
              : org.organization_plans?.[0]?.name
                ? org.organization_plans[0].name.charAt(0).toUpperCase() + org.organization_plans[0].name.slice(1)
                : "Free";

          return (
            <div
              key={org.id}
              onClick={() => router.push(`/dashboard/organizations/${org.slug}/projects`)}
              className="group p-3 rounded-md bg-card border border-border/40 hover:border-border cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {/* Icon */}
                <div className="flex-shrink-0 w-7 h-7 rounded bg-secondary flex items-center justify-center">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-medium truncate leading-tight">
                    {org.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {planName} Plan • {projectCount} project{projectCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty search state */}
      {filteredOrganizations.length === 0 && searchTerm && (
        <div className="text-center py-10">
          <p className="text-xs text-muted-foreground">
            No organizations found matching &quot;{searchTerm}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
