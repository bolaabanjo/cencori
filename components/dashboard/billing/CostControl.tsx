"use client";

import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

interface Project {
    id: string;
    slug: string;
    name: string;
    monthlyBudget: number | null;
    spendCap: number | null;
    enforceSpendCap: boolean;
    currentSpend: number;
}

interface CostControlProps {
    orgSlug: string;
    projects: Project[];
}

export function CostControl({ orgSlug, projects }: CostControlProps) {
    const firstProject = projects[0];

    return (
        <div className="rounded-md border border-border/40 bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium tracking-tight">Cost Control</h3>
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Configure budgets and spending limits for each project.
                    </p>
                </div>
                {firstProject ? (
                    <Button asChild variant="outline" className="h-7 text-xs">
                        <Link href={`/${orgSlug}/${firstProject.slug}/settings`}>
                            Configure Alerts
                        </Link>
                    </Button>
                ) : (
                    <Button variant="outline" className="h-7 text-xs" disabled>
                        Configure Alerts
                    </Button>
                )}
            </div>

            <div className="p-0">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="border-b border-border/40 bg-muted/30">
                            <th className="px-6 py-3 font-medium text-muted-foreground uppercase tracking-wider w-[40%]">Project</th>
                            <th className="px-6 py-3 font-medium text-muted-foreground uppercase tracking-wider text-right">Budget</th>
                            <th className="px-6 py-3 font-medium text-muted-foreground uppercase tracking-wider text-right">Spend</th>
                            <th className="px-6 py-3 font-medium text-muted-foreground uppercase tracking-wider text-right">Limit</th>
                            <th className="px-6 py-3 w-[50px]"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        {projects.map((project) => (
                            <tr key={project.id} className="group hover:bg-muted/20 transition-colors">
                                <td className="px-6 py-4 font-medium">
                                    <div className="flex items-center gap-2">
                                        <span>{project.name}</span>
                                        {project.enforceSpendCap && (
                                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-destructive/30 text-destructive/80 font-mono tracking-tight">
                                                HARD CAP
                                            </Badge>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                                    ${project.monthlyBudget?.toLocaleString() || '0'}
                                </td>
                                <td className="px-6 py-4 text-right tabular-nums font-medium">
                                    ${project.currentSpend.toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                                    {project.spendCap ? `$${project.spendCap.toLocaleString()}` : 'Unlimited'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <Button asChild variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Link href={`/${orgSlug}/${project.slug}/settings`}>
                                            <ChevronRight size={14} className="text-muted-foreground" />
                                        </Link>
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {projects.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground italic">
                                    No projects found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="px-6 py-3 border-t border-border/40 bg-muted/10 flex justify-between items-center">
                <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                    Updates may take up to 15 minutes.
                </p>
            </div>
        </div>
    );
}
