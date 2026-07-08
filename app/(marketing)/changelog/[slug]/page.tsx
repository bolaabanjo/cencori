import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import {
    getPostBySlug,
    getPostsByCategory,
    parseMDX,
    extractToc,
} from "@/lib/blog";
import { PostView } from "@/components/blog/PostView";
import { buildOgImageUrl } from "@/lib/og";

interface ChangelogPostPageProps {
    params: Promise<{
        slug: string;
    }>;
}

export function generateStaticParams() {
    const posts = getPostsByCategory("changelog");
    return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: ChangelogPostPageProps): Promise<Metadata> {
    const { slug } = await params;
    const post = getPostBySlug(slug);

    if (!post) return { title: "Post Not Found" };

    const authorName = post.authorDetails[0]?.name || "";
    const formattedDate = post.date
        ? new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "";

    const ogImage = post.coverImage
        ? post.coverImage
        : buildOgImageUrl({
              title: post.title,
              type: "blog",
              author: authorName,
              date: formattedDate,
          });

    return {
        title: post.title,
        description: post.excerpt,
        openGraph: {
            title: post.title,
            description: post.excerpt,
            type: "article",
            publishedTime: post.date,
            authors: post.authorDetails.map((a) => a.name),
            images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
        },
        twitter: {
            card: "summary_large_image",
            title: post.title,
            description: post.excerpt,
            images: [ogImage],
        },
    };
}

export default async function ChangelogPostPage({ params }: ChangelogPostPageProps) {
    const { slug } = await params;
    const post = getPostBySlug(slug);

    if (!post || !post.published || post.category !== "changelog") {
        notFound();
    }

    const content = await parseMDX(post.content);
    const toc = extractToc(post.content);

    // Prev / next across changelog posts only
    const changelogPosts = getPostsByCategory("changelog").filter((p) => p.published);
    const currentIndex = changelogPosts.findIndex((p) => p.slug === slug);
    const prevPost = currentIndex < changelogPosts.length - 1 ? changelogPosts[currentIndex + 1] : null;
    const nextPost = currentIndex > 0 ? changelogPosts[currentIndex - 1] : null;

    return (
        <PostView
            post={post}
            content={content}
            toc={toc}
            breadcrumb={
                <>
                    <Link href="/blog" className="text-primary hover:underline transition-colors">
                        Blog
                    </Link>
                    <span>/</span>
                    <Link href="/changelog" className="text-primary hover:underline transition-colors">
                        Changelog
                    </Link>
                </>
            }
            prevPost={prevPost}
            nextPost={nextPost}
        />
    );
}
