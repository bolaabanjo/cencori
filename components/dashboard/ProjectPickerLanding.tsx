'use client';

/**
 * Shared org-level project picker.
 *
 * Renders at `~/<section>` routes so clicking any project-scoped item in
 * the sidebar at org level (Logs, Observability, Security, etc.) shows a
 * "which project?" list. Selecting a project navigates to that project's
 * own version of the section.
 *
 * Rationale: those features are project-scoped by design. Cross-project
 * aggregation adds surface area and feature disparity without matching
 * user intent — users are almost always working inside one project at a
 * time. This picker is a jumping-off point, not a workspace.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { ArrowRight02Icon } from '@hugeicons/core-free-icons';

interface ProjectSummary {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    created_at: string;
}

interface Props {
    orgSlug: string;
    title: string;
    subtitle: string;
    icon: IconSvgElement;
    /** Path segment appended after the project slug — e.g. "logs" produces
     *  `/{org}/{project}/logs`. Can include nested segments like
     *  "ai-gateway/prompts". */
    destinationSuffix: string;
    /** Body copy shown in the empty state, when the org has no projects. */
    emptyStateBody: string;
}

function formatCreated(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${diffDays < 14 ? '' : 's'} ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${diffDays < 60 ? '' : 's'} ago`;
    return `${Math.floor(diffDays / 365)} year${diffDays < 730 ? '' : 's'} ago`;
}

export function ProjectPickerLanding({
    orgSlug,
    title,
    subtitle,
    icon,
    destinationSuffix,
    emptyStateBody,
}: Props) {
    const { data: projects, isLoading } = useQuery({
        queryKey: ['orgProjectsForPicker', orgSlug],
        queryFn: async (): Promise<ProjectSummary[]> => {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('id')
                .eq('slug', orgSlug)
                .single();
            if (!orgData) throw new Error('Organization not found');

            const { data: rows } = await supabase
                .from('projects')
                .select('id, slug, name, description, created_at')
                .eq('organization_id', orgData.id)
                .order('created_at', { ascending: false });

            return (rows as ProjectSummary[]) || [];
        },
        staleTime: 60 * 1000,
    });

    return (
        <div className="w-full max-w-3xl mx-auto px-6 py-10">
            <div className="mb-8">
                <h1 className="text-base font-medium">{title}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                    ))}
                </div>
            ) : !projects || projects.length === 0 ? (
                <EmptyState orgSlug={orgSlug} icon={icon} title={title} body={emptyStateBody} />
            ) : (
                <ul className="space-y-2">
                    {projects.map((project) => (
                        <li key={project.id}>
                            <Link
                                href={`/${orgSlug}/${project.slug}/${destinationSuffix}`}
                                className="group flex items-center gap-4 rounded-md border border-border/40 bg-card px-4 py-3 transition-colors hover:border-border hover:bg-card/80"
                            >
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary/60 text-muted-foreground group-hover:text-foreground transition-colors">
                                    <HugeiconsIcon icon={icon} className="h-4 w-4" />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{project.name}</p>
                                    <p className="text-[11px] text-muted-foreground truncate">
                                        {project.description || `Created ${formatCreated(project.created_at)}`}
                                    </p>
                                </div>

                                <span className="hidden sm:inline text-[11px] text-muted-foreground font-mono">
                                    /{project.slug}
                                </span>

                                <HugeiconsIcon
                                    icon={ArrowRight02Icon}
                                    className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0"
                                />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function EmptyState({
    orgSlug,
    icon,
    title,
    body,
}: {
    orgSlug: string;
    icon: IconSvgElement;
    title: string;
    body: string;
}) {
    return (
        <div className="border border-dashed border-border/60 rounded-md py-16 text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-secondary/60 text-muted-foreground">
                <HugeiconsIcon icon={icon} className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{body}</p>
            <Link href={`/${orgSlug}/~/projects/new`} className="inline-block mt-6">
                <Button className="h-7 text-xs px-3">Create project</Button>
            </Link>
            <p className="sr-only">{title}</p>
        </div>
    );
}
