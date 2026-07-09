/**
 * Blog MDX components — minimal, purpose-built.
 *
 * No inheritance from docs' mdxComponents. No rehype-pretty-code. Every
 * element style is defined here so nothing can silently override it from
 * global CSS or a peer component.
 *
 * Code blocks: <pre><code className="language-xxx">...</code></pre> is
 * transformed into <BlogCodeBlock> which does its own Shiki highlighting
 * and renders the fixed card design.
 */

import type { MDXComponents } from "mdx/types";
import type { ComponentProps, ReactNode } from "react";
import GithubSlugger from "github-slugger";
import { LinkIcon } from "lucide-react";

import { BlogCodeBlock } from "./BlogCodeBlock";
import { Callout } from "./Callout";
import { Card, Cards } from "./Cards";
import { CircuitBreakerDiagram } from "./CircuitBreakerDiagram";
import { SecurityArchitectureDiagram } from "./SecurityArchitectureDiagram";
import { TokenizationFlowDiagram } from "./TokenizationFlowDiagram";
import { VisionUploader } from "@/components/vision/vision-uploader";
import {
    GhostArrow,
    GhostBox,
    GhostBoxContent,
    GhostBoxTitle,
    GhostCaption,
    GhostContainer,
    GhostDashedLine,
    GhostGrid,
    GhostLabel,
    GhostPlaceholder,
} from "@/components/ui/ghost-diagram";
import { Check, X, AlertTriangle } from "lucide-react";
import { mdxComponents as docsComponents } from "@/components/docs/mdx";
import { cn } from "@/lib/utils";

// Styled inline icons — some blog posts use <Check />, <X />,
// <AlertTriangle /> inside prose as decorative markers.
const InlineCheck = ({ className, ...props }: ComponentProps<typeof Check>) => (
    <Check className={cn("inline-block h-4 w-4 align-middle text-green-500", className)} {...props} />
);
const InlineX = ({ className, ...props }: ComponentProps<typeof X>) => (
    <X className={cn("inline-block h-4 w-4 align-middle text-red-500", className)} {...props} />
);
const InlineAlertTriangle = ({ className, ...props }: ComponentProps<typeof AlertTriangle>) => (
    <AlertTriangle className={cn("inline-block h-4 w-4 align-middle text-amber-500", className)} {...props} />
);

// ── Helpers ───────────────────────────────────────────────────

/**
 * Convert heading text to an id/slug. Uses github-slugger so ids match
 * what `extractToc` produces — otherwise the TOC's IntersectionObserver
 * can't find the headings by id and active-section tracking breaks.
 *
 * Fresh slugger per call → no dedupe state, matches extractToc's behavior
 * where each heading is slugged independently at heading-time.
 */
function slugify(children: ReactNode): string {
    const raw = childrenToPlainText(children);
    return new GithubSlugger().slug(raw);
}

/**
 * Recursively walk a React children tree to a plain string. Handles
 * inline formatting (bold, italic, inline code) so a heading like
 * `## What is \`chat\`?` slugs on the same visible text as extractToc.
 */
function childrenToPlainText(node: ReactNode): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(childrenToPlainText).join("");
    if (typeof node === "object" && "props" in node) {
        const props = (node as { props?: { children?: ReactNode } }).props;
        if (props?.children !== undefined) return childrenToPlainText(props.children);
    }
    return "";
}

/**
 * Walk a React tree collecting text. Used to pull the raw code text out
 * of a <pre><code>...</code></pre> tree that MDX produces.
 */
function extractText(node: ReactNode): string {
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (node && typeof node === "object" && "props" in node) {
        const props = (node as { props?: { children?: ReactNode } }).props;
        if (props?.children !== undefined) return extractText(props.children);
    }
    return "";
}

// ── Headings ──────────────────────────────────────────────────

const H1 = ({ className, children, ...props }: ComponentProps<"h1">) => (
    <h1
        className={cn(
            "scroll-m-10 mt-10 text-3xl font-semibold tracking-tight first:mt-0",
            className,
        )}
        {...props}
    >
        {children}
    </h1>
);

const H2 = ({ className, children, ...props }: ComponentProps<"h2">) => {
    const id = slugify(children);
    return (
        <a href={`#${id}`} className="group relative no-underline text-primary">
            <LinkIcon className="absolute top-3 -left-5 hidden size-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100 lg:block" />
            <h2
                id={id}
                className={cn(
                    "scroll-m-10 mt-12 text-2xl font-semibold tracking-tight first:mt-0 [&+p]:mt-4",
                    className,
                )}
                {...props}
            >
                {children}
            </h2>
        </a>
    );
};

const H3 = ({ className, children, ...props }: ComponentProps<"h3">) => {
    const id = slugify(children);
    return (
        <h3
            id={id}
            className={cn(
                "scroll-m-10 mt-10 text-xl font-semibold tracking-tight [&+p]:mt-3",
                className,
            )}
            {...props}
        >
            {children}
        </h3>
    );
};

const H4 = ({ className, children, ...props }: ComponentProps<"h4">) => (
    <h4
        id={slugify(children)}
        className={cn(
            "scroll-m-10 mt-8 text-lg font-semibold tracking-tight",
            className,
        )}
        {...props}
    >
        {children}
    </h4>
);

// ── Prose ─────────────────────────────────────────────────────

const P = ({ className, ...props }: ComponentProps<"p">) => (
    <p
        className={cn(
            "mt-5 leading-[1.7] text-[15px] text-primary/85 first:mt-0",
            className,
        )}
        {...props}
    />
);

const A = ({ className, ...props }: ComponentProps<"a">) => (
    <a
        className={cn(
            "underline decoration-primary/40 underline-offset-2 hover:decoration-primary",
            className,
        )}
        {...props}
    />
);

const Ul = ({ className, ...props }: ComponentProps<"ul">) => (
    <ul className={cn("mt-4 ml-5 list-disc space-y-1.5 text-[15px]", className)} {...props} />
);

const Ol = ({ className, ...props }: ComponentProps<"ol">) => (
    <ol className={cn("mt-4 ml-5 list-decimal space-y-1.5 text-[15px]", className)} {...props} />
);

const Li = ({ className, ...props }: ComponentProps<"li">) => (
    <li className={cn("leading-[1.65] text-primary/85", className)} {...props} />
);

const Blockquote = ({ className, ...props }: ComponentProps<"blockquote">) => (
    <blockquote
        className={cn(
            "mt-6 border-l-2 border-neutral-300 pl-4 italic text-primary/70 dark:border-neutral-700",
            className,
        )}
        {...props}
    />
);

/**
 * Horizontal rules are intentionally suppressed on blog posts — headings
 * do all the sectioning work already, and stacked dividers plus H2s make
 * the layout busy. Authors can still use `---` in markdown; it just
 * renders as extra vertical space now.
 */
const Hr = ({ className }: ComponentProps<"hr">) => (
    <div className={cn("h-6", className)} aria-hidden="true" />
);

// ── Tables ────────────────────────────────────────────────────

const Table = ({ className, ...props }: ComponentProps<"table">) => (
    <div className="my-6 w-full overflow-x-auto">
        <table
            className={cn("w-full border-collapse text-[14px]", className)}
            {...props}
        />
    </div>
);

const Th = ({ className, ...props }: ComponentProps<"th">) => (
    <th
        className={cn(
            "border-b border-neutral-200 px-3 py-2 text-left font-medium text-primary dark:border-neutral-800",
            className,
        )}
        {...props}
    />
);

const Td = ({ className, ...props }: ComponentProps<"td">) => (
    <td
        className={cn(
            "border-b border-neutral-100 px-3 py-2 text-primary/85 dark:border-neutral-900",
            className,
        )}
        {...props}
    />
);

// ── Inline code (single-line `code` outside <pre>) ────────────

const InlineCode = ({ className, ...props }: ComponentProps<"code">) => (
    <code
        className={cn(
            "rounded-md border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] text-primary dark:border-neutral-800 dark:bg-neutral-900",
            className,
        )}
        {...props}
    />
);

// ── Code block override ───────────────────────────────────────
//
// MDX gives us <pre><code className="language-ts">code text</code></pre>.
// We extract the language string and the raw code, then hand off to
// BlogCodeBlock which does Shiki highlighting + the card layout.

interface PreChildProps {
    className?: string;
    children?: ReactNode;
}

const Pre = ({ children }: ComponentProps<"pre">) => {
    // `children` is the compiled <code> element from MDX
    const codeEl = children as { props?: PreChildProps } | undefined;
    const rawClassName = codeEl?.props?.className ?? "";
    const langMatch = rawClassName.match(/language-([\w+-]+)/);
    const language = langMatch?.[1] ?? "text";
    const code = extractText(codeEl?.props?.children ?? "");

    return <BlogCodeBlock code={code} language={language} />;
};

// ── Export ────────────────────────────────────────────────────

// Spread docs' MDX components first as fallbacks so blog posts can use
// docs-only components like <Steps>, <Alert>, <Kbd>, <Accordion>, etc.
// without importing them. Our own overrides come after and win for the
// prose surface (headings, paragraphs, code blocks, lists, tables).
//
// <Callout> is a blog-specific component and isn't in docsComponents,
// so we register it explicitly.
export const blogMdxComponents: MDXComponents = {
    ...docsComponents,
    h1: H1,
    h2: H2,
    h3: H3,
    h4: H4,
    p: P,
    a: A,
    ul: Ul,
    ol: Ol,
    li: Li,
    blockquote: Blockquote,
    hr: Hr,
    table: Table,
    th: Th,
    td: Td,
    code: InlineCode,
    pre: Pre,
    Callout,
    CircuitBreakerDiagram,
};
