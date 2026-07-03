import { ElineDocsPrevNext } from "@/components/eline/docs/prev-next";
import { elineMdxComponents } from "@/components/eline/docs/mdx";
import { ElineDocsToc } from "@/components/eline/docs/toc";
import { findNeighbour } from "fumadocs-core/page-tree";
import { elineSource } from "@/lib/eline-source";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export function generateStaticParams() {
  return elineSource.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/eline/docs/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = elineSource.getPage(params.slug);
  if (!page) return {};

  const { title, description } = page.data;
  return {
    title,
    description,
    openGraph: { type: "article", title, description, siteName: "Eline" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page(props: PageProps<"/eline/docs/[[...slug]]">) {
  const params = await props.params;
  const page = elineSource.getPage(params.slug);

  if (!page) {
    notFound();
  }

  const MDX = page.data.body;
  const neighbours = findNeighbour(elineSource.pageTree, page.url);

  return (
    <div className="flex">
      <article className="min-w-0 flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-3xl">
          {/* crop-mark framed title — echoes the /eline landing motif */}
          <div className="relative">
            <span className="pointer-events-none absolute -top-3 -left-3 select-none font-mono text-xs text-muted-foreground/30">
              +
            </span>
            <span className="pointer-events-none absolute -top-3 -right-3 select-none font-mono text-xs text-muted-foreground/30">
              +
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              {page.data.title}
            </h1>
            {page.data.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {page.data.description}
              </p>
            )}
          </div>

          <div className="mt-8">
            <MDX components={elineMdxComponents} />
          </div>

          <ElineDocsPrevNext
            previous={neighbours.previous}
            next={neighbours.next}
          />
        </div>
      </article>

      <aside className="sticky top-12 hidden h-[calc(100dvh-3rem)] w-56 shrink-0 overflow-y-auto px-6 py-10 xl:block">
        <ElineDocsToc toc={page.data.toc} />
      </aside>
    </div>
  );
}
