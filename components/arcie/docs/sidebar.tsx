"use client";

import type { Node as PageTreeNode, Root as PageTreeRoot } from "fumadocs-core/page-tree";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import Link from "next/link";
import { useArcieDocs } from "./sidebar-context";
import { cn } from "@/lib/utils";

function nodeLabel(node: { name?: React.ReactNode }) {
  return typeof node.name === "string" ? node.name : "";
}

// Whether a node (or any descendant) matches the active filter query.
function matches(node: PageTreeNode, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (node.type === "folder") {
    return (
      nodeLabel(node).toLowerCase().includes(needle) ||
      node.children.some((child) => matches(child, needle))
    );
  }
  if (node.type === "page") {
    return nodeLabel(node).toLowerCase().includes(needle);
  }
  return false;
}

function Tree({
  nodes,
  pathname,
  query,
}: {
  nodes: PageTreeNode[];
  pathname: string;
  query: string;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node, i) => {
        if (!matches(node, query)) return null;

        if (node.type === "separator") {
          return (
            <li
              key={`sep-${i}`}
              className="mt-4 mb-1 px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50"
            >
              {node.name}
            </li>
          );
        }

        if (node.type === "folder") {
          return (
            <li key={`folder-${nodeLabel(node) || i}`} className="mt-3">
              <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
                {node.name}
              </p>
              <Tree nodes={node.children} pathname={pathname} query={query} />
            </li>
          );
        }

        const active = pathname === node.url;
        return (
          <li key={node.url}>
            <Link
              href={node.url}
              className={cn(
                "block rounded-md px-2 py-1.5 text-[13px] transition-colors",
                active
                  ? "bg-[#a855f7]/10 font-medium text-[#a855f7]"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {node.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ArcieDocsSidebar({ tree }: { tree: PageTreeRoot }) {
  const pathname = usePathname();
  const { query, setQuery, mobileOpen, setMobileOpen } = useArcieDocs();

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-border/30 lg:sticky lg:top-12 lg:block lg:h-[calc(100dvh-3rem)] lg:w-60",
        mobileOpen ? "block" : "hidden",
      )}
    >
      <div className="flex h-full flex-col overflow-y-auto p-4">
        {/* Mobile-only filter (desktop filter lives in the header) */}
        <div className="relative mb-3 sm:hidden">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter pages"
            className="h-8 w-full rounded-md border border-border/30 bg-muted/30 pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <nav onClick={() => setMobileOpen(false)}>
          <Tree nodes={tree.children} pathname={pathname} query={query} />
        </nav>
      </div>
    </aside>
  );
}
