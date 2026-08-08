import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { getPostBySlug, getAllPosts, parseMDX, extractToc } from "@/lib/blog";
import { PostView } from "@/components/blog/PostView";

interface BlogPostPageProps {
    params: Promise<{
        slug: string;
    }>;
}

export function generateStaticParams() {
    const posts = getAllPosts().filter((p) => p.category !== "changelog");
    return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
    const { slug } = await params;
    const post = getPostBySlug(slug);

    if (!post) return { title: "Post Not Found" };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cencori.com';

    const ogImage = post.coverImage
        ? `${baseUrl}${post.coverImage.startsWith('/') ? '' : '/'}${post.coverImage}`
        : `${baseUrl}/blog/og/v1/${post.slug}.jpg`;

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

export default async function BlogPostPage({ params }: BlogPostPageProps) {
    const { slug } = await params;
    const post = getPostBySlug(slug);

    if (!post || !post.published) notFound();

    // Redirect changelog posts to /changelog/[slug]
    if (post.category === "changelog") {
        redirect(`/changelog/${slug}`);
    }

    const content = await parseMDX(post.content);
    const toc = extractToc(post.content);

    // Prev / next across all non-changelog posts
    const allPosts = getAllPosts().filter((p) => p.published && p.category !== "changelog");
    const currentIndex = allPosts.findIndex((p) => p.slug === slug);
    const prevPost = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;
    const nextPost = currentIndex > 0 ? allPosts[currentIndex - 1] : null;

    return (
        <PostView
            post={post}
            content={content}
            toc={toc}
            breadcrumb={
                <Link href="/blog" className="text-primary hover:underline transition-colors">
                    Blog
                </Link>
            }
            prevPost={prevPost}
            nextPost={nextPost}
        />
    );
}
