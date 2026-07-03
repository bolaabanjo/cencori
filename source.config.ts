import z from "zod";
import rehypePrettyCode from "rehype-pretty-code";
import { transformers } from "./lib/docs/highlight-code";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export default defineConfig({
  mdxOptions: {
    rehypePlugins: (plugins) => {
      plugins.shift();
      plugins.push([
        rehypePrettyCode,
        {
          theme: {
            light: "min-light",
            dark: "vesper",
          },
          defaultColor: false,
          transformers,
        },
      ]);

      return plugins;
    },
  },
});

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    // Extend Fumadocs' base schema to tolerate Cencori's existing frontmatter
    // (section/order/lastUpdated) alongside the optional image/links fields.
    schema: pageSchema.extend({
      section: z.string().optional(),
      order: z.number().optional(),
      lastUpdated: z.string().optional(),
      image: z.string().optional(),
      links: z
        .object({
          api: z.string().optional(),
          doc: z.string().optional(),
          github: z.string().optional(),
        })
        .optional(),
    }),
  },
});

export const arcie = defineDocs({
  dir: "content/arcie",
  docs: {
    schema: pageSchema.extend({
      order: z.number().optional(),
    }),
  },
});
