import { DocsPageTransition } from "@/components/docs/layout/page-transition";
import { SidebarInset, SidebarProvider } from "@/components/docs/ui/sidebar";
import DecorativeBorder from "@/components/docs/layout/decorative-border-svg";
import DocsHeader from "@/components/docs/sidebar/header";
import { DocsSidebar } from "@/components/docs/sidebar";
import { DocsProvider } from "@/components/docs/DocsContext";
import { DocsAskAI } from "@/components/docs/DocsAskAI";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Documentation", template: "%s — Cencori Docs" },
  description: "Cencori documentation — guides, API reference, and tutorials.",
  openGraph: {
    images: [
      {
        url: "/docs/og/v1/introduction.jpg?v=2",
        width: 1200,
        height: 630,
        alt: "Cencori Documentation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/docs/og/v1/introduction.jpg?v=2"],
  },
};

export default function DocsRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DocsProvider>
      <div className="docs-theme font-inter bg-sidebar text-foreground">
        <SidebarProvider>
          <DocsSidebar />
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
        <DocsAskAI />
      </div>
    </DocsProvider>
  );
}
