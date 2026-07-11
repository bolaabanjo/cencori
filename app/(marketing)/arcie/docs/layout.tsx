import { DocsPageTransition } from "@/components/docs/layout/page-transition";
import { SidebarInset, SidebarProvider } from "@/components/docs/ui/sidebar";
import DecorativeBorder from "@/components/docs/layout/decorative-border-svg";
import DocsHeader from "@/components/docs/sidebar/header";
import { ArcieDocsSidebar } from "@/components/arcie/docs/sidebar";
import { DocsProvider } from "@/components/docs/DocsContext";
import { ArcieDocsAskAI } from "@/components/arcie/docs/ask-ai";
import { arcieNavTree } from "@/lib/arcie-source";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Arcie Docs", template: "%s — Arcie" },
  description: "Arcie — build production agents as files. Documentation.",
};

export default function ArcieDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DocsProvider>
      <div className="docs-theme font-inter bg-sidebar text-foreground">
        <SidebarProvider>
          <ArcieDocsSidebar tree={arcieNavTree()} />
          <div
            className={cn("bg-sidebar w-full", "p-0 sm:py-2 sm:pr-2 sm:pl-4")}
          >
            <DecorativeBorder />
            <div
              className={cn(
                "no-scrollbar bg-background overflow-x-hidden overflow-y-auto sm:h-[calc(100vh-1rem)] sm:overscroll-none sm:border",
                "sm:rounded-tl-md sm:rounded-br-xl sm:rounded-bl-md",
              )}
            >
              <SidebarInset>
                <DocsHeader />
                <DocsPageTransition>{children}</DocsPageTransition>
              </SidebarInset>
            </div>
          </div>
        </SidebarProvider>
        <ArcieDocsAskAI />
      </div>
    </DocsProvider>
  );
}
