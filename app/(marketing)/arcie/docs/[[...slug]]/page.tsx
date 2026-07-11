import { DocsTableOfContents } from "@/components/docs/mdx/components/table-of-content";
import { TocAskAIButton } from "@/components/docs/layout/toc-ask-ai-button";
import { FeedbackButtons } from "@/components/docs/mdx/components/feedback-buttons";
import { DocsCopyPage } from "@/components/docs/layout/docs-copy-button";
import { MDXNavigation } from "@/components/docs/mdx/components/navigation";
import { findNeighbour } from "fumadocs-core/page-tree";
import { arcieMdxComponents } from "@/components/arcie/docs/mdx";
import { notFound } from "next/navigation";
import { absoluteUrl } from "@/lib/utils";
import { arcieSource } from "@/lib/arcie-source";
import type { Metadata } from "next";

export function generateStaticParams() {
  return arcieSource.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/arcie/docs/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = arcieSource.getPage(params.slug);
  if (!page) return {};

  const { title, description } = page.data;
  return {
    title,
    description,
    openGraph: { type: "article", title, description, siteName: "Arcie" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page(props: PageProps<"/arcie/docs/[[...slug]]">) {
  const params = await props.params;
  const page = arcieSource.getPage(params.slug);

  if (!page) {
    notFound();
  }

  const doc = page.data;
  const MDX = doc.body;
  const neighbours = findNeighbour(arcieSource.pageTree, page.url);

  const raw = await page.data.getText("raw");

  return (
    <div className="relative mt-10 flex sm:mt-0">
      <div className="docs-container flex min-w-0 flex-col py-12 pb-32">
        <div className="flex flex-row items-start gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <h1 className="scroll-m-20 text-3xl font-semibold tracking-tight xl:text-4xl">
              {doc.title}
            </h1>
            {doc.description && (
              <p className="text-muted-foreground text-[15px]">
                {doc.description}
              </p>
            )}
          </div>
          <div>{raw && <DocsCopyPage mdx={raw} url={absoluteUrl(page.url)} />}</div>
        </div>
        <div className="text-primary/80 mt-8 w-full min-w-0 flex-1 text-[14px] *:data-[slot=alert]:first:mt-0">
          <MDX components={arcieMdxComponents} />
        </div>
        <div className="mt-40 flex flex-col gap-8">
          <div className="flex flex-row items-center justify-between">
            <FeedbackButtons />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-8">
            <div>
              {neighbours.previous ? (
                <MDXNavigation
                  $id={neighbours.previous.$id}
                  type="previous"
                  title={neighbours.previous.name}
                  url={neighbours.previous.url}
                  description={neighbours.previous.description}
                />
              ) : (
                <div className="h-full rounded-md border border-dashed" />
              )}
            </div>
            <div>
              {neighbours.next ? (
                <MDXNavigation
                  $id={neighbours.next.$id}
                  type="next"
                  title={neighbours.next.name}
                  url={neighbours.next.url}
                  description={neighbours.next.description}
                />
              ) : (
                <div className="h-full rounded-md border border-dashed" />
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="sticky top-26 hidden h-fit self-start xl:flex">
        {doc.toc?.length ? (
          <div className="no-scrollbar w-72 overflow-y-auto px-8">
            <DocsTableOfContents toc={doc.toc} />
            <TocAskAIButton
              pageTitle={doc.title}
              pageSlug={page.url.replace(/^\/arcie\/docs\/?/, "")}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
