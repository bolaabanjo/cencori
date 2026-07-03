import { ArcieDocsProvider } from "@/components/arcie/docs/sidebar-context";
import { ArcieDocsSidebar } from "@/components/arcie/docs/sidebar";
import { ArcieDocsHeader } from "@/components/arcie/docs/header";
import { arcieSource } from "@/lib/arcie-source";
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
  const tree = arcieSource.pageTree;

  return (
    <div className="arcie-theme min-h-dvh bg-background text-foreground">
      <ArcieDocsProvider>
        <ArcieDocsHeader />
        <div className="mx-auto flex w-full max-w-6xl">
          <ArcieDocsSidebar tree={tree} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </ArcieDocsProvider>
    </div>
  );
}
