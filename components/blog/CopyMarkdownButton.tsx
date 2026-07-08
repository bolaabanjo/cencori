"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyMarkdownButtonProps {
    mdx: string;
    className?: string;
}

/**
 * Small "copy raw markdown" button for blog posts.
 *
 * Mirrors the affordance from the docs page (DocsCopyPage) but strips out
 * the v0/ChatGPT/Claude prompt links — those are docs-specific.
 */
export function CopyMarkdownButton({ mdx, className }: CopyMarkdownButtonProps) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(mdx);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            // Clipboard may be blocked (insecure context). Fail silently.
        }
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy post as Markdown"}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground",
                className,
            )}
        >
            {copied ? (
                <>
                    <Check className="h-3 w-3" />
                    Copied
                </>
            ) : (
                <>
                    <Copy className="h-3 w-3" />
                    Copy as Markdown
                </>
            )}
        </button>
    );
}
