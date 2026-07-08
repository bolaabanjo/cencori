/**
 * Blog code block — purpose-built card.
 *
 * Async server component that:
 *   1. Highlights `code` with Shiki (min-light / vesper themes).
 *   2. Renders a fixed card layout: rounded border, header row with
 *      language label + copy button, divider, code area.
 *
 * Fully self-contained. Doesn't inherit any docs styling, doesn't
 * depend on globals.css rules, doesn't need docs-theme scoping.
 */

import { codeToHtml } from "shiki";
import { CopyButton } from "./CopyButton";

const LANGUAGE_LABELS: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    typescript: "TypeScript",
    js: "JavaScript",
    javascript: "JavaScript",
    jsx: "JavaScript",
    py: "Python",
    python: "Python",
    rs: "Rust",
    rust: "Rust",
    go: "Go",
    golang: "Go",
    sh: "Shell",
    bash: "Bash",
    zsh: "Shell",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    mdx: "MDX",
    css: "CSS",
    html: "HTML",
    sql: "SQL",
    php: "PHP",
    java: "Java",
    kt: "Kotlin",
    swift: "Swift",
    rb: "Ruby",
    ruby: "Ruby",
    c: "C",
    cpp: "C++",
    cs: "C#",
    curl: "cURL",
    dockerfile: "Dockerfile",
    diff: "Diff",
    text: "Code",
    plain: "Code",
    plaintext: "Code",
};

function labelFor(language: string): string {
    if (!language) return "Code";
    const lower = language.toLowerCase();
    return LANGUAGE_LABELS[lower] ?? (lower.charAt(0).toUpperCase() + lower.slice(1));
}

// Shiki throws on unknown languages. Normalize to something safe.
const SHIKI_LANG_ALIASES: Record<string, string> = {
    curl: "bash",
    text: "text",
    plain: "text",
    plaintext: "text",
    output: "text",
};

function normalizeShikiLang(language: string): string {
    const lower = language.toLowerCase();
    return SHIKI_LANG_ALIASES[lower] ?? lower;
}

interface BlogCodeBlockProps {
    code: string;
    language?: string;
}

export async function BlogCodeBlock({ code, language = "text" }: BlogCodeBlockProps) {
    const shikiLang = normalizeShikiLang(language);

    let html: string;
    try {
        html = await codeToHtml(code, {
            lang: shikiLang,
            themes: { light: "min-light", dark: "vesper" },
            defaultColor: false,
        });
    } catch {
        // Unsupported language — render as plain text.
        html = await codeToHtml(code, {
            lang: "text",
            themes: { light: "min-light", dark: "vesper" },
            defaultColor: false,
        });
    }

    return (
        <div className="my-6 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-[#0f0f10]">
            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-100/40 px-4 py-1.5 dark:border-neutral-800 dark:bg-neutral-900/40">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {labelFor(language)}
                </span>
                <CopyButton text={code} />
            </div>
            <div
                className="blog-code-inner overflow-x-auto px-4 py-4 text-[.8125rem] leading-6 [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </div>
    );
}
