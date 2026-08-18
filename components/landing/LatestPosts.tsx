import Link from "next/link";
import { Button } from "@/components/ui/button";

const POSTS = [
  {
    title: "Introducing Cencori Web",
    excerpt:
      "Search, fetch, extract, and crawl the web through infrastructure we own — with evidence, citations, and no third-party search API.",
    href: "/blog/introducing-cencori-web",
    date: "Aug 8, 2026",
    category: "Product",
  },
  {
    title: "Introducing Cencori MCP",
    excerpt:
      "Cencori is now native to every MCP client — web search, memory, agents, and multimodal tools through one secure server.",
    href: "/blog/introducing-cencori-mcp",
    date: "Aug 8, 2026",
    category: "Product",
  },
  {
    title: "Building an AI Security Layer",
    excerpt:
      "How we approach prompt injection, PII, and output filtering for production AI products.",
    href: "/blog/building-ai-security-layer",
    date: "Feb 2026",
    category: "Security",
  },
] as const;

export const LatestPosts = () => {
  return (
    <section className="bg-background border-b border-border/30">
      <div className="mx-auto max-w-6xl border-x border-border/30 relative">
        {/* Corner Intersection Markers */}
        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

        {/* Column Dividers Intersection Markers (top and bottom of dividers) */}
        <div className="hidden md:flex absolute -top-1.5 left-1/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="hidden md:flex absolute -bottom-1.5 left-1/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="hidden md:flex absolute -top-1.5 left-2/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="hidden md:flex absolute -bottom-1.5 left-2/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

        <div className="flex md:grid md:grid-cols-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none scrollbar-hide md:divide-x divide-border/30">
          {POSTS.map((post, index) => (
            <article
              key={post.href}
              className={`flex flex-col justify-between px-6 py-12 sm:px-12 md:py-16 min-w-[85vw] sm:min-w-[70vw] md:min-w-0 snap-center ${index > 0 ? "border-l border-border/30 md:border-l-0" : ""}`}
            >
              <div>
                <h3 className="font-heading text-xl font-semibold leading-snug text-foreground">
                  {post.title}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
              </div>
              <div className="mt-8 space-y-4">
                <p className="text-xs text-muted-foreground">
                  {post.date}
                  <span className="mx-2">·</span>
                  {post.category}
                </p>
                <Link href={post.href} className="inline-block">
                  <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                    Read more
                  </Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
