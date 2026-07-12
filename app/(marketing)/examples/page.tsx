"use client";

import React from "react";
import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "@heroicons/react/24/outline";
import { EXAMPLE_PROJECTS, type ExampleProject } from "@/config/examples";
import { siteConfig } from "@/config/site";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const categoryLabels = {
    app: "App Frameworks",
    api: "API Examples",
    agent: "Agent Frameworks",
};

function ExampleCard({ project }: { project: ExampleProject }) {
    return (
        <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between p-4 border-b border-border/40 hover:bg-foreground/[0.02] transition-colors"
        >
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium group-hover:text-foreground transition-colors">
                        {project.name}
                    </h3>
                    {project.featured && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 rounded bg-emerald-500/10 text-emerald-500 border-0">
                            Featured
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">
                    {project.description}
                </p>
            </div>
            <ArrowUpRightIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-4" />
        </a>
    );
}

export default function ExamplesPage() {
    const appExamples = EXAMPLE_PROJECTS.filter(p => p.category === 'app');
    const apiExamples = EXAMPLE_PROJECTS.filter(p => p.category === 'api');
    const agentExamples = EXAMPLE_PROJECTS.filter(p => p.category === 'agent');

    return (
      <main className="pt-32 pb-20">
                <div className="container mx-auto px-4 md:px-6 max-w-4xl">
                    {/* Header */}
                    <div className="mb-12">
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tighter mb-4">
                            Example Projects
                        </h1>
                        <p className="text-base text-muted-foreground max-w-xl">
                            Ready-to-deploy applications built with Cencori. Clone a repo and start building.
                        </p>
                    </div>

                    {/* Categories */}
                    <div className="space-y-8">
                        {/* App Frameworks */}
                        {appExamples.length > 0 && (
                            <div>
                                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                    {categoryLabels.app}
                                </h2>
                                <div className="border border-border/40 rounded-lg overflow-hidden">
                                    {appExamples.map((project) => (
                                        <ExampleCard key={project.id} project={project} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* API Examples */}
                        {apiExamples.length > 0 && (
                            <div>
                                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                    {categoryLabels.api}
                                </h2>
                                <div className="border border-border/40 rounded-lg overflow-hidden">
                                    {apiExamples.map((project) => (
                                        <ExampleCard key={project.id} project={project} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Agent Frameworks */}
                        {agentExamples.length > 0 && (
                            <div>
                                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                    {categoryLabels.agent}
                                </h2>
                                <div className="border border-border/40 rounded-lg overflow-hidden">
                                    {agentExamples.map((project) => (
                                        <ExampleCard key={project.id} project={project} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* CTA */}
                    <div className="mt-16 text-center">
                        <p className="text-sm text-muted-foreground mb-4">
                            Have an example to share?
                        </p>
                        <a href="https://github.com/cencori/examples" target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="h-8 px-4 text-xs rounded-full">
                                Contribute on GitHub <ArrowRightIcon className="ml-2 w-3 h-3" />
                            </Button>
                        </a>
                    </div>
                </div>
            </main>
    );
}
