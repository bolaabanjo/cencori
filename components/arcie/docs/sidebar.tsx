import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/docs/ui/sidebar";
import { ArcieRenderDefaultOptions } from "./render-default-options";
import { ArcieNavMain } from "./nav-main";
import type { Root } from "fumadocs-core/page-tree";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

export function ArcieDocsSidebar({
  tree,
  ...props
}: React.ComponentProps<typeof Sidebar> & { tree: Root }) {
  // Root-level docs pages (no folder) become the "Getting Started" group,
  // since ArcieNavMain only renders folders.
  const gettingStartedOptions = tree.children
    .filter((node) => node.type === "page")
    .map((node) => {
      const page = node as { name: React.ReactNode; url: string };
      return {
        name: typeof page.name === "string" ? page.name : String(page.name),
        url: page.url,
        key: page.url.split("/").pop() ?? "",
      };
    });

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="p-4 pt-6">
        <Link
          href="/arcie"
          aria-label="Arcie home"
          className="z-10 flex items-center gap-2"
        >
          <span className="font-mono text-base font-semibold tracking-tight">
            arcie<span className="text-[#a855f7]">.</span>
          </span>
          <span className="rounded-full border border-border/40 px-2 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Docs
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent
        className={cn("docs-sidebar-top-fade select-none", "pt-2 pb-14")}
      >
        <ArcieRenderDefaultOptions
          options={gettingStartedOptions}
          label="Getting Started"
        />
        <ArcieNavMain tree={tree} />
      </SidebarContent>
    </Sidebar>
  );
}
