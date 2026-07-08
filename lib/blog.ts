import 'server-only';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { compileMDX } from 'next-mdx-remote/rsc';
import readingTime from 'reading-time';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');
const AUTHORS_DIR = path.join(process.cwd(), 'content', 'authors');

export interface Author {
  slug: string;
  name: string;
  avatar: string;
  role: string;
  bio?: string;
  twitter?: string;
  github?: string;
}

export type BlogCategory =
  | 'engineering'
  | 'product'
  | 'community'
  | 'customers'
  | 'changelog'
  | 'press';

export const BLOG_CATEGORIES: { slug: BlogCategory | 'all'; label: string }[] = [
  { slug: 'all', label: 'All' },
  { slug: 'engineering', label: 'Engineering' },
  { slug: 'product', label: 'Product' },
  { slug: 'community', label: 'Community' },
  { slug: 'customers', label: 'Customers' },
  { slug: 'changelog', label: 'Changelog' },
  { slug: 'press', label: 'Press' },
];

export interface BlogPostFrontmatter {
  title: string;
  slug: string;
  date: string;
  excerpt: string;
  coverImage: string;
  authors: string[];
  tags: string[];
  category?: BlogCategory;
  externalUrl?: string;
  published: boolean;
}

export interface BlogPost extends BlogPostFrontmatter {
  content: string;
  readTime: string;
  authorDetails: Author[];
}

/**
 * Get all author profiles
 */
export function getAllAuthors(): Author[] {
  if (!fs.existsSync(AUTHORS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(AUTHORS_DIR);
  return files
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const content = fs.readFileSync(path.join(AUTHORS_DIR, file), 'utf-8');
      return JSON.parse(content) as Author;
    });
}

/**
 * Get author by slug
 */
export function getAuthorBySlug(slug: string): Author | null {
  const authors = getAllAuthors();
  return authors.find((author) => author.slug === slug) || null;
}

/**
 * Get all blog posts
 */
export function getAllPosts(includeUnpublished = false): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BLOG_DIR);
  const posts = files
    .filter((file) => file.endsWith('.mdx') || file.endsWith('.md'))
    .map((file) => {
      const filePath = path.join(BLOG_DIR, file);
      const fileContents = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(fileContents);

      const frontmatter = data as BlogPostFrontmatter;

      // Get author details
      const authorDetails = frontmatter.authors
        ? frontmatter.authors.map((slug) => getAuthorBySlug(slug)).filter(Boolean) as Author[]
        : [];

      // Calculate reading time
      const stats = readingTime(content);

      return {
        ...frontmatter,
        excerpt: frontmatter.excerpt || '',
        content,
        readTime: stats.text,
        authorDetails,
      };
    })
    .filter((post) => includeUnpublished || post.published)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return posts;
}

/**
 * Get a single post by slug
 */
export function getPostBySlug(slug: string): BlogPost | null {
  const posts = getAllPosts(true);
  return posts.find((post) => post.slug === slug) || null;
}

/**
 * Get posts by tag
 */
export function getPostsByTag(tag: string): BlogPost[] {
  const posts = getAllPosts();
  return posts.filter((post) => post.tags.includes(tag));
}

/**
 * Get posts by category
 */
export function getPostsByCategory(category: BlogCategory): BlogPost[] {
  const posts = getAllPosts();
  return posts.filter((post) => post.category === category);
}

/**
 * Get the URL path for a blog post based on its category
 */
export function getPostUrl(post: BlogPost | BlogPostFrontmatter): string {
  if (post.category === 'changelog') return `/changelog/${post.slug}`;
  return `/blog/${post.slug}`;
}

/**
 * Get posts by author
 */
export function getPostsByAuthor(authorSlug: string): BlogPost[] {
  const posts = getAllPosts();
  return posts.filter((post) => post.authors.includes(authorSlug));
}

/**
 * Get all unique tags
 */
export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tags = new Set<string>();
  posts.forEach((post) => {
    post.tags.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort();
}

import { blogMdxComponents } from '@/components/blog/mdx-components';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import GithubSlugger from 'github-slugger';

/**
 * A single TOC entry — matches the shape DocsTableOfContents expects.
 */
export interface BlogTocEntry {
  title: string;
  url: string; // `#${slug}` — matches rehype-slug output
  depth: number;
}

/**
 * Extract a table of contents from MDX source. Uses github-slugger so the
 * slugs line up with what rehype-slug produces during rendering.
 *
 * Skips headings inside fenced code blocks (```) and inline HTML-only
 * heading markup. Includes h2-h4 by default — h1 is the post title,
 * shown separately.
 */
export function extractToc(content: string, opts: { minDepth?: number; maxDepth?: number } = {}): BlogTocEntry[] {
  const min = opts.minDepth ?? 2;
  const max = opts.maxDepth ?? 4;
  const slugger = new GithubSlugger();
  const entries: BlogTocEntry[] = [];
  let inCodeFence = false;

  for (const line of content.split('\n')) {
    // Track fenced code blocks so we don't pick up "# " inside them
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const depth = match[1].length;
    if (depth < min || depth > max) continue;

    // Strip inline markdown emphasis / code for the visible title
    const rawTitle = match[2]
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    entries.push({
      title: rawTitle,
      url: `#${slugger.slug(rawTitle)}`,
      depth,
    });
  }

  return entries;
}

/**
 * Parse and render MDX content for the blog.
 *
 * Uses the same MDX component set and Shiki syntax highlighter as the
 * docs so blog posts get the same rendering quality — tables, code blocks,
 * headings, links, callouts all match the docs. Blog content typically
 * uses the "prose" subset (headings, tables, code, links, lists,
 * blockquote); docs-specific structural components like Steps or ApiTable
 * are available as escape hatches but shouldn't be common.
 */
export async function parseMDX(content: string) {
  const { content: mdxContent } = await compileMDX({
    source: content,
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypeSlug],
      },
    },
    components: blogMdxComponents,
  });

  return mdxContent;
}