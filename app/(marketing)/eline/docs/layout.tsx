import { ElineDocsProvider } from "@/components/eline/docs/sidebar-context";
import { ElineDocsSidebar } from "@/components/eline/docs/sidebar";
import { ElineDocsHeader } from "@/components/eline/docs/header";
import { elineSource } from "@/lib/eline-source";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Eline Docs", template: "%s — Eline" },
  description: "Eline — build production agents as files. Documentation.",
};

export default function ElineDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tree = elineSource.pageTree;

  return (
    <div className="eline-theme min-h-dvh bg-background text-foreground">
      <ElineDocsProvider>
        <ElineDocsHeader />
        <div className="mx-auto flex w-full max-w-6xl">
          <ElineDocsSidebar tree={tree} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </ElineDocsProvider>
    </div>
  );
}
