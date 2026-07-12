import { Suspense } from "react";
import type { Metadata } from "next";

import { getPostsByCategory } from "@/lib/blog";
import { ChangelogTimeline } from "@/components/blog/ChangelogTimeline";
import { BlogTabs } from "@/components/blog/BlogTabs";

export const metadata: Metadata = {
    title: "Changelog — Cencori",
    description: "What's new in Cencori. Feature releases and platform updates.",
};

export default async function ChangelogPage() {
    const posts = getPostsByCategory("changelog")
        .filter((p) => p.published)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <main className="flex-1 pt-20">
            <div className="border-b border-border/40">
                <div className="container mx-auto py-8 px-4 max-w-5xl space-y-5">
                    <div>
                        <h1 className="text-lg font-semibold">Changelog</h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            What's new in Cencori. Feature releases and platform updates.
                        </p>
                    </div>
                    <Suspense>
                        <BlogTabs />
                    </Suspense>
                </div>
            </div>
            <ChangelogTimeline posts={posts} />
        </main>
    );
}
