"use client";

/**
 * Simple table of contents for blog posts.
 *
 * Unlike the docs' TOC (which has an animated SVG path indicator and an
 * end marker), this is a flat list. The active section is highlighted
 * with a bold text weight and a left border stripe. Nothing else moves,
 * nothing doubles.
 */

import { useEffect, useState } from "react";
import { Menu02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

interface TocItem {
    title?: React.ReactNode;
    url: string;
    depth: number;
}

interface BlogTableOfContentsProps {
    toc: TocItem[];
    className?: string;
}

function useActiveHeading(itemIds: string[]): string | null {
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        if (itemIds.length === 0) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setActiveId(entry.target.id);
                    }
                }
            },
            { rootMargin: "0% 0% -60% 0%" },
        );

        for (const id of itemIds) {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        }
        return () => observer.disconnect();
    }, [itemIds]);

    return activeId;
}

export function BlogTableOfContents({ toc, className }: BlogTableOfContentsProps) {
    const itemIds = toc.map((item) => item.url.replace(/^#/, ""));
    const activeId = useActiveHeading(itemIds);

    if (toc.length === 0) return null;

    return (
        <div className={cn("flex flex-col text-sm select-none", className)}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/75 mb-3">
                <HugeiconsIcon size={14} icon={Menu02Icon} />
                <span>On This Page</span>
            </div>
            <ul className="flex flex-col gap-2 border-l border-border/50">
                {toc.map((item) => {
                    const isActive = item.url === `#${activeId}`;
                    return (
                        <li key={item.url} className="relative">
                            {/* Active-item left stripe overlay */}
                            {isActive && (
                                <span
                                    aria-hidden="true"
                                    className="absolute -left-px top-0 h-full w-px bg-primary"
                                />
                            )}
                            <a
                                href={item.url}
                                data-depth={item.depth}
                                className={cn(
                                    "block text-[0.8rem] no-underline transition-colors duration-150",
                                    "data-[depth=2]:pl-4 data-[depth=3]:pl-7 data-[depth=4]:pl-10",
                                    isActive
                                        ? "font-medium text-foreground"
                                        : "text-muted-foreground/75 hover:text-foreground",
                                )}
                            >
                                {item.title}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
