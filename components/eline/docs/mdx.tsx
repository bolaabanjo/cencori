import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Internal links use next/link; external links open in a new tab. Purple accent.
function ElineLink({ href = "#", className, ...props }: ComponentProps<"a">) {
  const internal = href.startsWith("/") || href.startsWith("#");
  const cls = cn(
    "text-[#a855f7] underline-offset-4 hover:underline",
    className,
  );
  if (internal) {
    return <Link href={href} className={cls} {...props} />;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cls} {...props} />
  );
}

// Note/warning/info callout box. Used across the docs via <Callout type="…">.
function ElineCallout({
  type = "note",
  className,
  ...props
}: ComponentProps<"div"> & { type?: "note" | "info" | "tip" | "warning" }) {
  const tones: Record<string, string> = {
    note: "border-[#a855f7]/40 bg-[#a855f7]/[0.06]",
    info: "border-sky-500/40 bg-sky-500/[0.06]",
    tip: "border-emerald-500/40 bg-emerald-500/[0.06]",
    warning: "border-amber-500/40 bg-amber-500/[0.06]",
  };
  return (
    <div
      className={cn(
        "my-5 rounded-lg border px-4 py-3 text-sm text-muted-foreground [&>p]:my-0 [&>p+p]:mt-2",
        tones[type] ?? tones.note,
        className,
      )}
      {...props}
    />
  );
}

// Lean, eline-branded MDX map. Syntax highlighting, the mono font, and line
// padding come from global CSS + the shared rehype-pretty-code config, so code
// blocks only need a container here. classNames are MERGED (not replaced) so the
// `shiki` class survives on <pre> — the global color rules target `.shiki span`.
export const elineMdxComponents: MDXComponents = {
  Callout: ElineCallout,
  h1: ({ className, ...p }: ComponentProps<"h1">) => (
    <h1
      className={cn(
        "scroll-mt-20 text-2xl font-semibold tracking-tight",
        className,
      )}
      {...p}
    />
  ),
  h2: ({ className, ...p }: ComponentProps<"h2">) => (
    <h2
      className={cn(
        "mt-10 mb-3 scroll-mt-20 border-b border-border/30 pb-1.5 text-lg font-semibold tracking-tight",
        className,
      )}
      {...p}
    />
  ),
  h3: ({ className, ...p }: ComponentProps<"h3">) => (
    <h3
      className={cn(
        "mt-6 mb-2 scroll-mt-20 text-sm font-semibold tracking-tight",
        className,
      )}
      {...p}
    />
  ),
  p: ({ className, ...p }: ComponentProps<"p">) => (
    <p
      className={cn(
        "my-3 text-sm leading-relaxed text-muted-foreground",
        className,
      )}
      {...p}
    />
  ),
  a: ElineLink,
  ul: ({ className, ...p }: ComponentProps<"ul">) => (
    <ul
      className={cn(
        "my-3 ml-4 list-disc space-y-1.5 text-sm text-muted-foreground marker:text-[#a855f7]/60",
        className,
      )}
      {...p}
    />
  ),
  ol: ({ className, ...p }: ComponentProps<"ol">) => (
    <ol
      className={cn(
        "my-3 ml-4 list-decimal space-y-1.5 text-sm text-muted-foreground",
        className,
      )}
      {...p}
    />
  ),
  li: ({ className, ...p }: ComponentProps<"li">) => (
    <li className={cn("leading-relaxed", className)} {...p} />
  ),
  code: ({ className, ...p }: ComponentProps<"code">) => (
    <code
      className={cn(
        "rounded bg-muted/70 px-1.5 py-0.5 text-[0.85em] text-foreground",
        className,
      )}
      {...p}
    />
  ),
  pre: ({ className, ...p }: ComponentProps<"pre">) => (
    <pre
      className={cn(
        "my-5 overflow-x-auto rounded-xl border border-border/30 bg-card px-4 py-3 text-[13px] leading-relaxed",
        // Neutralize the inline-code styling for block code inside the <pre>.
        "[&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[13px]",
        className,
      )}
      {...p}
    />
  ),
  table: ({ className, ...p }: ComponentProps<"table">) => (
    <div className="my-5 overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...p}
      />
    </div>
  ),
  th: ({ className, ...p }: ComponentProps<"th">) => (
    <th
      className={cn(
        "border-b border-border/30 px-3 py-2 text-left font-mono text-xs font-medium text-foreground",
        className,
      )}
      {...p}
    />
  ),
  td: ({ className, ...p }: ComponentProps<"td">) => (
    <td
      className={cn(
        "border-b border-border/20 px-3 py-2 align-top text-muted-foreground",
        className,
      )}
      {...p}
    />
  ),
  hr: ({ className, ...p }: ComponentProps<"hr">) => (
    <hr className={cn("my-8 border-border/30", className)} {...p} />
  ),
  blockquote: ({ className, ...p }: ComponentProps<"blockquote">) => (
    <blockquote
      className={cn(
        "my-4 border-l-2 border-[#a855f7]/50 pl-4 text-sm italic text-muted-foreground",
        className,
      )}
      {...p}
    />
  ),
};
