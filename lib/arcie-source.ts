import { loader } from "fumadocs-core/source";
import type { Root, Node, Folder } from "fumadocs-core/page-tree";
import { arcie } from "@/.source/server";

export const arcieSource = loader({
  baseUrl: "/arcie/docs",
  source: arcie.toFumadocsSource(),
});

/**
 * Arcie content is flat (content/arcie/*.mdx) with `---Section---` separators
 * in meta.json. The docs-style sidebar renders root pages as a "Getting
 * Started" group and folders as collapsible sections, so this converts the
 * first separator group into root pages and each later group into a
 * pseudo-folder. Page URLs are untouched.
 */
export function arcieNavTree(): Root {
  const tree = arcieSource.pageTree;
  const groups: { label: string; pages: Node[] }[] = [{ label: "", pages: [] }];

  for (const node of tree.children) {
    if (node.type === "separator") {
      groups.push({
        label: typeof node.name === "string" ? node.name : "",
        pages: [],
      });
    } else {
      groups[groups.length - 1].pages.push(node);
    }
  }

  const nonEmpty = groups.filter((g) => g.pages.length > 0);
  const [first, ...rest] = nonEmpty;

  const folders: Folder[] = rest.map((group, i) => ({
    type: "folder",
    $id: `arcie-group-${i}`,
    name: group.label,
    children: group.pages,
  }));

  return {
    ...tree,
    children: [...(first?.pages ?? []), ...folders],
  };
}
