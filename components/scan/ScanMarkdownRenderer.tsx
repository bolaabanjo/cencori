/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { Copy } from "lucide-react";
import React from "react";
import { toast } from "@/components/ui/toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Simple syntax highlighter
function highlightCode(code: string, lang: string) {
    if (!code) return code?.toString() || "";

    const keywords = /\b(const|let|var|function|return|if|else|for|while|import|export|from|async|await|class|processed|interface|type|public|private|protected|try|catch|finally|def|class|return|in|is|not|and|or|print)\b/g;
    const strings = /("([^"]*)"|'([^']*)'|`([^`]*)`)/g;
    const numbers = /\b\d+\b/g;
    const comments = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g;
    const functions = /\b([a-zA-Z_]\w*)(?=\()/g;
    const brackets = /([{}[\],])/g;

    const tokenizers = [
        { type: "comment", regex: comments, color: "text-slate-500 dark:text-slate-400" },
        { type: "string", regex: strings, color: "text-green-600 dark:text-green-400" },
        { type: "keyword", regex: keywords, color: "text-purple-600 dark:text-purple-400" },
        { type: "function", regex: functions, color: "text-blue-600 dark:text-blue-400" },
        { type: "number", regex: numbers, color: "text-orange-600 dark:text-orange-400" },
        { type: "bracket", regex: brackets, color: "text-yellow-600 dark:text-yellow-500" },
    ];

    let segments: { text: string; color?: string }[] = [{ text: code }];

    for (const token of tokenizers) {
        const newSegments: { text: string; color?: string }[] = [];
        for (const segment of segments) {
            if (segment.color) {
                newSegments.push(segment);
                continue;
            }

            let lastIndex = 0;
            token.regex.lastIndex = 0;

            const text = segment.text;
            const matches = Array.from(text.matchAll(token.regex));

            if (matches.length === 0) {
                newSegments.push(segment);
                continue;
            }

            for (const m of matches) {
                if (m.index! > lastIndex) {
                    newSegments.push({ text: text.slice(lastIndex, m.index!) });
                }
                newSegments.push({ text: m[0], color: token.color });
                lastIndex = m.index! + m[0].length;
            }
            if (lastIndex < text.length) {
                newSegments.push({ text: text.slice(lastIndex) });
            }
        }
        segments = newSegments;
    }

    return segments.map((s, i) => (
        <span key={i} className={s.color || "text-foreground"}>{s.text}</span>
    ));
}

/**
 * Compact markdown renderer for the scan AI output.
 * Styled to match the SharedChatUI's prose-sm look — small, tight, and readable.
 */
export function ScanMarkdownRenderer({ content }: { content: string }) {
    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        toast.success("Code copied", { duration: 2000 });
    };

    return (
        <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code({ className, children, node: _node, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        const isInline = !match && !className?.includes("language-");

                        if (!isInline && match) {
                            const language = match[1];
                            const codeString = String(children).replace(/\n$/, "");

                            return (
                                <div className="my-2 rounded-lg overflow-hidden border border-border/50 bg-muted/30 dark:bg-[#1e1e1e] not-prose">
                                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 dark:bg-white/5 border-b border-border/50 dark:border-white/5">
                                        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{language}</span>
                                        <button onClick={() => copyCode(codeString)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                            <Copy className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed bg-transparent m-0 border-0">
                                        <code>{highlightCode(codeString, language)}</code>
                                    </pre>
                                </div>
                            );
                        }

                        return (
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary font-medium" {...props}>
                                {children}
                            </code>
                        );
                    },
                    table: ({ node: _node, ...props }) => (
                        <div className="my-3 w-full overflow-x-auto rounded-lg border border-border/50">
                            <table className="w-full border-collapse text-sm" {...props} />
                        </div>
                    ),
                    thead: ({ node: _node, ...props }) => (
                        <thead className="bg-muted/50 border-b border-border/50" {...props} />
                    ),
                    tbody: ({ node: _node, ...props }) => (
                        <tbody className="divide-y divide-border/50" {...props} />
                    ),
                    tr: ({ node: _node, ...props }) => (
                        <tr className="hover:bg-muted/30 transition-colors" {...props} />
                    ),
                    th: ({ node: _node, ...props }) => (
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap" {...props} />
                    ),
                    td: ({ node: _node, ...props }) => (
                        <td className="px-3 py-2 align-top text-sm" {...props} />
                    ),
                    p: ({ node: _node, ...props }) => (
                        <p className="text-sm text-foreground/90 leading-relaxed mb-2 last:mb-0" {...props} />
                    ),
                    h1: ({ node: _node, ...props }) => <h1 className="text-sm font-bold mt-4 mb-1.5" {...props} />,
                    h2: ({ node: _node, ...props }) => <h2 className="text-sm font-bold mt-3 mb-1" {...props} />,
                    h3: ({ node: _node, ...props }) => <h3 className="text-sm font-semibold mt-2.5 mb-1" {...props} />,
                    h4: ({ node: _node, ...props }) => <h4 className="text-xs font-semibold mt-2 mb-0.5" {...props} />,
                    ul: ({ node: _node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-0.5" {...props} />,
                    ol: ({ node: _node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5" {...props} />,
                    li: ({ node: _node, ...props }) => <li className="pl-0.5 text-sm" {...props} />,
                    a: ({ node: _node, ...props }) => (
                        <a className="text-primary hover:underline font-medium cursor-pointer" target="_blank" rel="noopener noreferrer" {...props} />
                    ),
                    blockquote: ({ node: _node, ...props }) => (
                        <blockquote className="border-l-2 border-primary/30 pl-3 py-0.5 my-2 italic text-sm text-muted-foreground bg-muted/10 rounded-r" {...props} />
                    ),
                    hr: ({ node: _node, ...props }) => <hr className="my-4 border-border/50" {...props} />,
                    strong: ({ node: _node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
