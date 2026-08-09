import Link from "next/link";
import Image from "next/image";
import { BlogPost } from "@/lib/blog";
import { Clock, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";

interface BlogCardProps {
    post: BlogPost;
}

export function BlogCard({ post }: BlogCardProps) {
    const coverImage = post.coverImage || `/blog/og/v1/${post.slug}.jpg`;

    return (
        <Link href={post.category === "changelog" ? `/changelog/${post.slug}` : `/blog/${post.slug}`} className="block h-full group">
            <div className="h-full border border-border/50 rounded-lg overflow-hidden bg-background hover:border-border transition-colors">
                {/* Cover Image */}
                <div className="relative w-full h-36 overflow-hidden border-b border-border/40">
                    <Image
                        src={coverImage}
                        alt={post.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        unoptimized
                    />
                </div>

                {/* Content */}
                <div className="flex flex-col flex-1 p-4">
                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {post.tags.slice(0, 2).map((tag) => (
                                <span
                                    key={tag}
                                    className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Title */}
                    <h3 className="text-sm font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                        {post.title}
                    </h3>

                    {/* Excerpt */}
                    <p className="text-xs text-muted-foreground mb-4 line-clamp-2 flex-1">
                        {post.excerpt}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-auto">
                        {/* Author & Date */}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {post.authorDetails && post.authorDetails.length > 0 && (
                                <>
                                    {post.authorDetails[0].avatar && (
                                        <div className="relative w-5 h-5 rounded-full overflow-hidden border border-border/50">
                                            <Image
                                                src={post.authorDetails[0].avatar}
                                                alt={post.authorDetails[0].name}
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                    )}
                                    <span>{post.authorDetails[0].name}</span>
                                    <span className="text-muted-foreground/40">·</span>
                                </>
                            )}
                            <span>{format(new Date(post.date), "MMM d")}</span>
                        </div>

                        {/* Read Time & Arrow */}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {post.readTime}
                            </div>
                            <ArrowUpRight className="h-3 w-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-primary" />
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
