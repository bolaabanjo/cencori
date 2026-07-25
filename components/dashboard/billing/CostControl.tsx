"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function formatAmount(amount: number | null): string {
    if (amount === null) return "Not set";
    return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function CostControl({ orgSlug, projects }: CostControlProps) {
    const firstProject = projects[0];

    return (
        <section className="grid gap-6 border-t border-border/30 py-9 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
            <div>
                <h2 className="text-sm font-medium">Spend limits</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    Set monthly budgets and choose whether projects stop when they reach their limit.
                </p>
            </div>

            <div className="min-w-0 overflow-hidden rounded-lg border border-border/40 bg-muted/20">
                <div className="flex items-center justify-between gap-4 border-b border-border/30 bg-muted/50 px-4 py-3">
                    <p className="text-sm font-medium">Projects</p>
                    {firstProject ? (
                        <Button asChild className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none">
                            <Link href={`/${orgSlug}/${firstProject.slug}/settings`}>
                                Manage limits
                                <ArrowUpRight className="size-3" />
                            </Link>
                        </Button>
                    ) : null}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-xs">
                        <thead>
                            <tr className="border-b border-border/30 text-muted-foreground">
                                <th className="px-4 py-2.5 font-normal">Project</th>
                                <th className="px-4 py-2.5 text-right font-normal">Monthly budget</th>
                                <th className="px-4 py-2.5 text-right font-normal">Current spend</th>
                                <th className="px-4 py-2.5 text-right font-normal">Spend cap</th>
                                <th className="w-12 px-4 py-2.5" />
                            </tr>
                        </thead>
                        <tbody>
                            {projects.map((project) => (
                                <tr key={project.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/30">
                                    <td className="px-4 py-3.5">
                                        <div className="font-medium">{project.name}</div>
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">/{project.slug}</div>
                                    </td>
                                    <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                                        {formatAmount(project.monthlyBudget)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right tabular-nums">
                                        {formatAmount(project.currentSpend)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right">
                                        <div className="tabular-nums text-muted-foreground">{formatAmount(project.spendCap)}</div>
                                        <div className={project.enforceSpendCap ? "mt-0.5 text-[11px] text-red-600 dark:text-red-400" : "mt-0.5 text-[11px] text-muted-foreground"}>
                                            {project.enforceSpendCap ? "Hard stop" : "Advisory only"}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5 text-right">
                                        <Button asChild variant="ghost" size="icon" className="size-7 rounded-md text-muted-foreground shadow-none hover:text-foreground">
                                            <Link href={`/${orgSlug}/${project.slug}/settings`} aria-label={`Configure limits for ${project.name}`}>
                                                <ArrowUpRight className="size-3" />
                                            </Link>
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {projects.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                                        Create a project to configure spend limits.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}
