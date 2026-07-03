"use client";

import { Github, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { useArcieDocs } from "./sidebar-context";

// Slim top bar for the Arcie docs — wordmark, sidebar filter, GitHub link, and a
// mobile nav toggle. Deliberately minimal and distinct from the Cencori docs header.
export function ArcieDocsHeader() {
  const { query, setQuery, mobileOpen, setMobileOpen } = useArcieDocs();

  return (
    <header className="sticky top-0 z-40 border-b border-border/30 bg-background/80 backdrop-blur-sm">
      <div className="flex h-12 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-muted-foreground hover:text-foreground lg:hidden"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>

        <Link
          href="/arcie"
          className="font-mono text-sm font-semibold tracking-tight"
        >
          arcie<span className="text-[#a855f7]">.</span>
        </Link>
        <span className="hidden rounded-full border border-border/30 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground/60 sm:inline">
          Docs
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              aria-label="Filter pages"
              className="h-7 w-40 rounded-md border border-border/30 bg-muted/30 pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-[#a855f7]/50"
            />
          </div>
          <a
            href="https://github.com/cencori/arcie"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Arcie on GitHub"
          >
            <Github className="size-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
