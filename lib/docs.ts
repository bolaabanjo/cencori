import 'server-only';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { compileMDX } from 'next-mdx-remote/rsc';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

const DOCS_DIR = path.join(process.cwd(), 'content', 'docs');

import { CUSTOM_SHIKI_THEME } from './shiki-theme';

export interface DocFrontmatter {
    title: string;
    description: string;
    section: string;
    order: number;
    lastUpdated?: string;
}

export interface Doc extends DocFrontmatter {
    slug: string;
    content: string;
    lastUpdated?: string;
}

export interface NavItem {
    title: string;
    href: string;
    order: number;
    isSubItem?: boolean;
}

export interface NavSection {
    title: string;
    items: NavItem[];
    subGroup?: {
        title: string;
        items: NavItem[];
    };
}

export interface Heading {
    id: string;
    text: string;
    level: number;
}

/**
 * Recursively get all MDX files from a directory
 */
function getMdxFiles(dir: string, basePath = ''): string[] {
    if (!fs.existsSync(dir)) {
        return [];
    }

    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);

        if (entry.isDirectory()) {
            files.push(...getMdxFiles(fullPath, relativePath));
        } else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) {
            files.push(relativePath);
        }
    }

    return files;
}

/**
 * Convert file path to URL slug
 */
function filePathToSlug(filePath: string): string {
    return filePath
        .replace(/\.(mdx|md)$/, '')
        .replace(/\/_index$/, '')
        .replace(/\/index$/, '')
        .replace(/^\//, '');
}

/**
 * Get all documentation pages
 */
export function getAllDocs(): Doc[] {
    const files = getMdxFiles(DOCS_DIR);

    return files.map((file) => {
        const filePath = path.join(DOCS_DIR, file);
        const fileContents = fs.readFileSync(filePath, 'utf-8');
        const { data, content } = matter(fileContents);
        const stats = fs.statSync(filePath);

        const frontmatter = data as DocFrontmatter;
        const slug = filePathToSlug(file);

        return {
            ...frontmatter,
            slug,
            content,
            lastUpdated: frontmatter.lastUpdated ?? stats.mtime.toISOString(),
        };
    });
}

/**
 * Get a single doc by slug
 */
export function getDocBySlug(slug: string): Doc | null {
    const docs = getAllDocs();
    return docs.find((doc) => doc.slug === slug) || null;
}

/**
 * Build navigation structure from docs frontmatter
 */
export function getDocsNavigation(): NavSection[] {
    const docs = getAllDocs();

    // Group by section, with sub-groups for ai-gateway
    const sections = new Map<string, NavItem[]>();

    for (const doc of docs) {
        const section = doc.section || 'Other';
        
        // Check if this is an AI Gateway doc (in ai-gateway/ subfolder under platform)
        if (doc.slug.includes('/ai-gateway/')) {
            // AI Gateway docs get their own sub-group under Platform
            if (!sections.has('Platform:AI Gateway')) {
                sections.set('Platform:AI Gateway', []);
            }
            sections.get('Platform:AI Gateway')!.push({
                title: doc.title,
                href: `/docs/${doc.slug}`,
                order: doc.order || 999,
                isSubItem: true,
            });
            // Still add to Platform main group too (for the accordion to show)
            if (!sections.has('Platform')) {
                sections.set('Platform', []);
            }
            // Skip adding to main Platform - we'll combine them later
            continue;
        }
        
        if (!sections.has(section)) {
            sections.set(section, []);
        }
        sections.get(section)!.push({
            title: doc.title,
            href: `/docs/${doc.slug}`,
            order: doc.order || 999,
        });
    }

    // Sort items within each section
    const result: NavSection[] = [];
    const sectionOrder = [
        'Getting Started',
        'Platform',
        'AI',
        'Agents',
        'Security',
        'Integrations',
        'Guides',
        'API Reference',
        'Hackathons',
    ];

    for (const sectionTitle of sectionOrder) {
        const items = sections.get(sectionTitle);
        if (items) {
            // Check for AI Gateway sub-items
            const subItems = sections.get(`${sectionTitle}:AI Gateway`);
            const hasSubGroup = sectionTitle === 'Platform' && subItems && subItems.length > 0;
            
            result.push({
                title: sectionTitle,
                items: items.sort((a, b) => a.order - b.order),
                subGroup: hasSubGroup ? {
                    title: 'AI Gateway',
                    items: subItems.sort((a, b) => a.order - b.order),
                } : undefined,
            });
            sections.delete(sectionTitle);
            // Also delete the AI Gateway sub-group key
            sections.delete(`${sectionTitle}:AI Gateway`);
        }
    }

    return result;
}

/**
 * Extract headings from MDX content for TOC
 */
export function extractHeadings(content: string): Heading[] {
    const headingRegex = /^(#{2,3})\s+(.+)$/gm;
    const headings: Heading[] = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = text
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-');

        headings.push({ id, text, level });
    }

    return headings;
}

// Import docs-specific MDX components
import { DocsMDXComponents } from '@/components/docs/DocsMDXComponents';

/**
 * Parse and render MDX content
 */
export async function parseMDX(content: string) {
    const { content: mdxContent } = await compileMDX({
        source: content,
        options: {
            parseFrontmatter: false,
            mdxOptions: {
                remarkPlugins: [remarkGfm],
                rehypePlugins: [
                    rehypeSlug,
                    [
                        rehypePrettyCode,
                        {
                            theme: CUSTOM_SHIKI_THEME,
                        },
                    ],
                ],
            },
        },
        components: DocsMDXComponents,
    });

    return mdxContent;
}

/**
 * Get previous and next docs for navigation
 */
export function getDocNavigation(currentSlug: string): { prev: Doc | null; next: Doc | null } {
    const docs = getAllDocs().sort((a, b) => {
        // Sort by section then by order
        if (a.section !== b.section) {
            const sectionOrder = [
                'Getting Started',
                'Platform',
                'AI',
                'Endpoints',
                'Agents',
                'Security',
                'Integrations',
                'Guides',
                'API Reference',
                'Hackathons',
            ];
            return sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
        }
        return (a.order || 999) - (b.order || 999);
    });

    const currentIndex = docs.findIndex((doc) => doc.slug === currentSlug);

    return {
        prev: currentIndex > 0 ? docs[currentIndex - 1] : null,
        next: currentIndex < docs.length - 1 ? docs[currentIndex + 1] : null,
    };
}
