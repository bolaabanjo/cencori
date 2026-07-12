import { Suspense } from "react";
import { getAllPosts } from "@/lib/blog";
import { BlogList } from "@/components/blog/BlogList";
import { BlogTabs } from "@/components/blog/BlogTabs";

export default function BlogPage() {
    const allPosts = getAllPosts().filter((p) => p.category !== "press");

    return (
        <main className="flex-1 pt-20">
                <div className="border-b border-border/40">
                    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-5">
                        <div>
                            <h1 className="text-lg font-semibold">Blog</h1>
                            <p className="text-xs text-muted-foreground mt-1">
                                Updates, announcements, and engineering insights
                            </p>
                        </div>
                        <Suspense>
                            <BlogTabs />
                        </Suspense>
                    </div>
                </div>

                <Suspense>
                    <BlogList posts={allPosts} />
                </Suspense>
            </main>
    );
}
