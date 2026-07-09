/**
 * Linear-style changelog timeline.
 *
 * Each entry renders its full MDX content inline (no card / click-
 * through). The date sits in a fixed left column; the content flows on
 * the right. A vertical border-l stripe connects the entries; a small
 * dot sits at each entry's top.
 *
 * Server component so we can parseMDX synchronously per entry.
 */

import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { LinkIcon } from "lucide-react";

import { parseMDX, type BlogPost } from "@/lib/blog";

interface ChangelogTimelineProps {
    posts: BlogPost[];
}

interface EntryProps {
    post: BlogPost;
}

async function Entry({ post }: EntryProps) {
    const content = await parseMDX(post.content);
    const permalink = `/changelog/${post.slug}`;

    return (
        <article
            id={post.slug}
            className="relative grid grid-cols-1 gap-x-8 gap-y-4 py-10 md:grid-cols-[100px_minmax(0,1fr)] md:py-14"
        >
            {/* Date column — sticky top-aligned on md+ */}
            <div className="relative md:pt-1">
                <div className="hidden md:block sticky top-28">
                    <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                        <time
                            dateTime={new Date(post.date).toISOString()}
                            className="text-xs font-medium text-muted-foreground"
                        >
                            {format(new Date(post.date), "MMM d, yyyy")}
                        </time>
                    </div>
                </div>
                {/* Mobile date */}
                <div className="flex items-center gap-3 md:hidden">
                    <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                    <time
                        dateTime={new Date(post.date).toISOString()}
                        className="text-xs font-medium text-muted-foreground"
                    >
                        {format(new Date(post.date), "MMM d, yyyy")}
                    </time>
                </div>
            </div>

            {/* Content column — everything (title, cover, body, code
                blocks, author line) constrained to max-w-md so the
                columns line up with the cover image. */}
            <div className="min-w-0 max-w-md">
                {/* Title with permalink anchor on hover */}
                <div className="group flex items-start gap-2">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
                        <Link href={permalink} className="no-underline hover:text-primary">
                            {post.title}
                        </Link>
                    </h2>
                    <Link
                        href={permalink}
                        aria-label="Permalink"
                        className="mt-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                    >
                        <LinkIcon className="h-3.5 w-3.5" />
                    </Link>
                </div>

                {/* Cover image */}
                {post.coverImage && (
                    <div className="mt-4 relative w-full aspect-[16/9] overflow-hidden rounded-md border border-border/50 bg-muted/30">
                        <Image
                            src={post.coverImage}
                            alt={post.title}
                            fill
                            className="object-cover"
                            unoptimized
                        />
                    </div>
                )}

                {/* MDX content */}
                <div className="mt-5 text-primary/85 text-[14px] leading-[1.65]">
                    {content}
                </div>

                {/* Author line */}
                {post.authorDetails && post.authorDetails.length > 0 && (
                    <p className="mt-6 text-[11px] text-muted-foreground">
                        {post.authorDetails.map((a) => a.name).join(", ")}
                    </p>
                )}
            </div>
        </article>
    );
}

export async function ChangelogTimeline({ posts }: ChangelogTimelineProps) {
    if (posts.length === 0) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-24 text-center">
                <h3 className="text-sm font-semibold mb-1">No changelog entries yet</h3>
                <p className="text-xs text-muted-foreground">
                    Updates will appear here as features ship.
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-3xl px-4 md:px-8">
            <div className="relative">
                {/* Timeline vertical line — sits at the boundary between
                    the date column and the content column on md+ */}
                <div
                    aria-hidden="true"
                    className="absolute left-[7px] top-0 bottom-0 w-px bg-border/40 md:left-[103px]"
                />

                <div className="divide-y divide-border/30">
                    {posts.map((post) => (
                        <Entry key={post.slug} post={post} />
                    ))}
                </div>
            </div>
        </div>
    );
}
