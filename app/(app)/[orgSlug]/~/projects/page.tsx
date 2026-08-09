"use client";

import { use, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Github } from "@lobehub/icons";
import { Bot } from "lucide-react";
import {
  Add01Icon,
  AiFolder01Icon,
  ArrowDown01Icon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  Globe02Icon,
  LockIcon,
  PauseIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { supabase as browserSupabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
}

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  visibility: "private" | "public";
  github_repo_url?: string;
  status: "active" | "inactive";
  region?: string;
  created_at: string;
}

function useOrgAndProjects(orgSlug: string) {
  return useQuery({
    queryKey: ["orgProjects", orgSlug],
    queryFn: async () => {
      const { data: orgData, error: orgError } = await browserSupabase
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", orgSlug)
        .single();

      if (orgError || !orgData) throw new Error("Organization not found");

      const { data: projectsData, error: projectsError } = await browserSupabase
        .from("projects")
        .select("id, name, slug, description, visibility, github_repo_url, status, region, created_at")
        .eq("organization_id", orgData.id)
        .order("created_at", { ascending: false });

      if (projectsError) throw new Error("We couldn’t load this organization’s projects.");

      return {
        organization: orgData as OrganizationData,
        projects: (projectsData || []) as ProjectData[],
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function OrgProjectsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, error, refetch } = useOrgAndProjects(orgSlug);
  const organization = data?.organization;
  const projects = data?.projects || [];

  if (isLoading) return <ProjectsPageSkeleton />;

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="border-t border-border/30 py-16">
          <p className="text-sm font-medium">Projects are unavailable</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{error.message}</p>
          <Button size="sm" className="mt-4 h-8 rounded-md px-3 text-xs" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (!organization) {
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm font-medium">Organization not found</p>
      </main>
    );
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProjects = projects.filter((project) =>
    !normalizedSearch
    || project.name.toLowerCase().includes(normalizedSearch)
    || project.description?.toLowerCase().includes(normalizedSearch)
    || project.slug.toLowerCase().includes(normalizedSearch)
    || project.region?.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 pb-28 sm:px-6 sm:py-10 lg:px-8">
      <header>
        <h1 className="text-3xl font-medium tracking-[-0.04em]">Projects</h1>
      </header>

      <section className="pt-6" aria-labelledby="project-registry-heading">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-[320px]">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.7}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search projects"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              autoComplete="off"
              aria-label="Search projects"
              className="h-8 rounded-md border-border/35 bg-muted/20 pl-9 text-xs placeholder:text-muted-foreground/60"
            />
          </div>

          <CreateProjectMenu orgSlug={orgSlug} />
        </div>

        {projects.length === 0 ? (
          <NoProjects orgSlug={orgSlug} organizationName={organization.name} />
        ) : filteredProjects.length === 0 ? (
          <NoSearchResults searchTerm={searchTerm} onClear={() => setSearchTerm("")} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/20">
            <div className="flex items-center justify-between gap-4 border-b border-border/30 bg-muted/45 px-5 py-3 sm:px-6">
              <div>
                <h2 id="project-registry-heading" className="text-xs font-medium">Project registry</h2>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Select a project to enter its infrastructure control plane.
                </p>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {filteredProjects.length} {filteredProjects.length === 1 ? "record" : "records"}
              </span>
            </div>

            <div className="divide-y divide-border/30">
              {filteredProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onOpen={() => router.push(`/${orgSlug}/${project.slug}`)}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function CreateProjectMenu({ orgSlug }: { orgSlug: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-8 shrink-0 rounded-md px-3 text-xs">
          New project
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.8} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {process.env.NODE_ENV !== "production" && (
          <DropdownMenuItem asChild className="cursor-pointer text-xs">
            <Link href={`/${orgSlug}/~/projects/new-agent`}>
              <Bot size={14} className="mr-2" aria-hidden="true" />
              Deploy an agent
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className="cursor-pointer text-xs">
          <Link href={`/${orgSlug}/~/projects/new`}>
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.7} className="mr-2" aria-hidden="true" />
            Empty project (gateway only)
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer text-xs">
          <Link href={`/${orgSlug}/~/projects/import/github`}>
            <Github size={14} className="mr-2" aria-hidden="true" />
            Import from GitHub
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectRow({ project, onOpen }: { project: ProjectData; onOpen: () => void }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="group cursor-pointer px-5 py-4 outline-none transition-colors duration-200 hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 sm:py-5"
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.7fr)_minmax(90px,0.7fr)_minmax(110px,0.7fr)_minmax(90px,0.6fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-medium tracking-[-0.01em]">{project.name}</h3>
            {project.github_repo_url && (
              <Github size={12} className="shrink-0 text-muted-foreground" aria-label="GitHub connected" />
            )}
          </div>
          {project.description && (
            <p className="mt-1 truncate text-[11px] leading-5 text-muted-foreground">
              {project.description}
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/65">{project.slug}</p>
        </div>

        <ProjectField label="Region">
          <span className="font-mono text-[11px]">{project.region || "Not assigned"}</span>
        </ProjectField>

        <ProjectField label="Created">
          <span className="text-[11px]">{formatProjectDate(project.created_at)}</span>
        </ProjectField>

        <ProjectField label="Access">
          <span className="inline-flex items-center gap-1.5 text-[11px] capitalize">
            <HugeiconsIcon
              icon={project.visibility === "public" ? Globe02Icon : LockIcon}
              size={12}
              strokeWidth={1.7}
              className="text-muted-foreground"
              aria-hidden="true"
            />
            {project.visibility}
          </span>
        </ProjectField>

        <div className="flex items-center justify-between gap-4 md:justify-end">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium capitalize ${project.status === "active" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
            <HugeiconsIcon
              icon={project.status === "active" ? CheckmarkCircle02Icon : PauseIcon}
              size={13}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            {project.status}
          </span>
          <HugeiconsIcon
            icon={ArrowRight02Icon}
            size={14}
            strokeWidth={1.7}
            className="text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden="true"
          />
        </div>
      </div>
    </article>
  );
}

function ProjectField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 md:block">
      <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/65">{label}</p>
      <div className="mt-0 text-muted-foreground md:mt-1.5">{children}</div>
    </div>
  );
}

function NoProjects({ orgSlug, organizationName }: { orgSlug: string; organizationName: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/20">
      <div className="grid gap-8 px-6 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:px-8 md:py-12">
        <div>
          <div className="flex size-10 items-center justify-center rounded-[10px] border border-border/35 bg-background/35 text-muted-foreground">
            <HugeiconsIcon icon={AiFolder01Icon} size={18} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-lg font-medium tracking-[-0.02em]">Create the first workload boundary</h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
            A project gives {organizationName} isolated API keys, routing policy, telemetry, security controls, and spend limits.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="h-8 rounded-md px-3 text-xs">
            <Link href={`/${orgSlug}/~/projects/new`}>Create project</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 rounded-md px-3 text-xs">
            <Link href={`/${orgSlug}/~/projects/import/github`}>Import from GitHub</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function NoSearchResults({ searchTerm, onClear }: { searchTerm: string; onClear: () => void }) {
  return (
    <div className="rounded-lg border border-border/35 bg-muted/20 px-6 py-12">
      <p className="text-sm font-medium">No matching projects</p>
      <p className="mt-1 text-xs text-muted-foreground">Nothing matches “{searchTerm}”.</p>
      <Button variant="outline" size="sm" className="mt-4 h-8 rounded-md px-3 text-xs" onClick={onClear}>
        Clear search
      </Button>
    </div>
  );
}

function ProjectsPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header>
        <Skeleton className="h-8 w-40" />
      </header>

      <section className="pt-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-full max-w-[320px]" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/20">
          <div className="border-b border-border/30 bg-muted/45 px-6 py-3">
            <Skeleton className="h-3 w-28" />
          </div>
          {[1, 2, 3].map((item) => (
            <div key={item} className="border-b border-border/30 px-6 py-5 last:border-b-0">
              <div className="flex items-center">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-56 max-w-full" />
                </div>
                <Skeleton className="hidden h-3 w-20 sm:block" />
                <Skeleton className="hidden h-3 w-20 sm:block" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function formatProjectDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
