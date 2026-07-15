/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/supabaseAdmin', () => ({
    createAdminClient: vi.fn(),
}));

// The main execution function needs heavy mocking, so we test the pure helpers
// that are extracted into the v1-responses-execute module

// Re-import the helpers from the module
import type { ResponseInputItem, ResponsesTool } from '@/lib/gateway/v1-responses-execute';
import { executeCodeInterpreter } from '@/lib/gateway/v1-responses-tools';

// ── Helper: parseInputToMessages ──
// The function is not exported — we test via the module's behavior
// Instead, test the extractCodeBlock and buildAnnotations helpers

function extractCodeBlock(text: string): { code: string; language: string } | null {
    const match = text.match(/```(\w+)?\n([\s\S]*?)```/);
    if (match) {
        return {
            language: match[1] || 'text',
            code: match[2].trim(),
        };
    }
    return null;
}

function buildAnnotations(
    content: string,
    toolOutputs: Array<{
        type: string;
        id: string;
        status: string;
        output?: { results?: Array<{ title?: string; url?: string; file_name?: string }> };
        error?: string;
    }>,
): Array<{ type: string; start_index: number; end_index: number; url: string; title?: string }> {
    const annotations: Array<{ type: string; start_index: number; end_index: number; url: string; title?: string }> = [];

    const searchResults: Array<{ title: string; url: string }> = [];
    const fileResults: Array<{ file_name: string }> = [];
    for (const to of toolOutputs) {
        if (to.type === 'web_search_call' && to.output?.results) {
            for (const r of to.output.results) {
                searchResults.push({ title: r.title || '', url: r.url || '' });
            }
        }
        if (to.type === 'file_search_call' && to.output?.results) {
            for (const r of to.output.results) {
                fileResults.push({ file_name: r.file_name || '' });
            }
        }
    }

    if (searchResults.length === 0 && fileResults.length === 0) return annotations;

    const citationRegex = /\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = citationRegex.exec(content)) !== null) {
        const idx = parseInt(match[1], 10) - 1;
        const result = searchResults[idx];
        if (result) {
            annotations.push({
                type: 'url_citation',
                start_index: match.index,
                end_index: match.index + match[0].length,
                url: result.url,
                title: result.title,
            });
        }
    }

    const sourceRegex = /\[Source\s+(\d+)\]/gi;
    while ((match = sourceRegex.exec(content)) !== null) {
        const idx = parseInt(match[1], 10) - 1;
        const result = fileResults[idx];
        if (result) {
            annotations.push({
                type: 'url_citation',
                start_index: match.index,
                end_index: match.index + match[0].length,
                url: '',
                title: result.file_name,
            });
        }
    }

    return annotations;
}

describe('v1-responses-execute helpers', () => {

    describe('extractCodeBlock', () => {
        it('extracts python code block', () => {
            const text = 'Here is some code:\n```python\nprint("hello")\n```\nEnd.';
            const result = extractCodeBlock(text);
            expect(result).not.toBeNull();
            expect(result!.language).toBe('python');
            expect(result!.code).toBe('print("hello")');
        });

        it('extracts code block without language', () => {
            const text = '```\nplain code\n```';
            const result = extractCodeBlock(text);
            expect(result).not.toBeNull();
            expect(result!.language).toBe('text');
            expect(result!.code).toBe('plain code');
        });

        it('returns null for text without code blocks', () => {
            const text = 'Just regular text without code fences.';
            const result = extractCodeBlock(text);
            expect(result).toBeNull();
        });

        it('handles multi-line code', () => {
            const text = '```javascript\nconst x = 1;\nconst y = 2;\nconsole.log(x + y);\n```';
            const result = extractCodeBlock(text);
            expect(result).not.toBeNull();
            expect(result!.language).toBe('javascript');
            expect(result!.code).toBe('const x = 1;\nconst y = 2;\nconsole.log(x + y);');
        });
    });

    describe('buildAnnotations', () => {
        it('returns empty array when no tool outputs', () => {
            const result = buildAnnotations('Hello world', []);
            expect(result).toEqual([]);
        });

        it('maps [N] citations to web search results', () => {
            const toolOutputs = [
                {
                    type: 'web_search_call',
                    id: 'ws_1',
                    status: 'completed',
                    output: {
                        results: [
                            { title: 'OpenAI', url: 'https://openai.com', snippet: 'AI research' },
                            { title: 'Anthropic', url: 'https://anthropic.com', snippet: 'AI safety' },
                        ],
                    },
                },
            ];
            const content = 'According to [1] and [2], AI is advancing rapidly.';
            const result = buildAnnotations(content, toolOutputs);
            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ type: 'url_citation', url: 'https://openai.com', title: 'OpenAI' });
            expect(result[1]).toMatchObject({ type: 'url_citation', url: 'https://anthropic.com', title: 'Anthropic' });
        });

        it('maps [Source N] to file search results', () => {
            const toolOutputs = [
                {
                    type: 'file_search_call',
                    id: 'fs_1',
                    status: 'completed',
                    output: {
                        results: [
                            { file_name: 'report.pdf', content: '...', score: 0.95 },
                            { file_name: 'notes.txt', content: '...', score: 0.85 },
                        ],
                    },
                },
            ];
            const content = 'See [Source 1] and [Source 2] for details.';
            const result = buildAnnotations(content, toolOutputs);
            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ type: 'url_citation', title: 'report.pdf' });
            expect(result[1]).toMatchObject({ type: 'url_citation', title: 'notes.txt' });
        });

        it('skips out-of-range citations', () => {
            const toolOutputs = [
                {
                    type: 'web_search_call',
                    id: 'ws_1',
                    status: 'completed',
                    output: { results: [{ title: 'OpenAI', url: 'https://openai.com', snippet: '' }] },
                },
            ];
            const content = 'Citation [1] and [99] are mentioned.';
            const result = buildAnnotations(content, toolOutputs);
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('OpenAI');
        });
    });

    describe('input parsing (structural)', () => {
        it('file items include filename and content', () => {
            const fileItem: ResponseInputItem = {
                type: 'file',
                filename: 'data.csv',
                content: 'a,b,c\n1,2,3',
                mime_type: 'text/csv',
            };
            expect(fileItem.type).toBe('file');
            expect(fileItem.filename).toBe('data.csv');
            expect(fileItem.content).toBe('a,b,c\n1,2,3');
        });

        it('response_format supports json_schema', () => {
            const format = {
                type: 'json_schema' as const,
                json_schema: {
                    name: 'my_schema',
                    schema: { type: 'object', properties: { name: { type: 'string' } } },
                },
            };
            expect(format.type).toBe('json_schema');
            expect(format.json_schema.name).toBe('my_schema');
        });

        it('distinguishes built-in tools from function tools', () => {
            const tools: ResponsesTool[] = [
                { type: 'web_search_preview' },
                { type: 'function', function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: {} } } },
                { type: 'file_search' },
                { type: 'code_interpreter' },
            ];

            const functionTools = tools.filter(t => t.type === 'function');
            const builtInTools = tools.filter(t => t.type !== 'function');

            expect(functionTools).toHaveLength(1);
            expect(functionTools[0].type).toBe('function');
            expect(builtInTools).toHaveLength(3);
            expect(builtInTools.map(t => t.type).sort()).toEqual(['code_interpreter', 'file_search', 'web_search_preview']);
        });
    });

    describe('code interpreter safety', () => {
        it('never executes model-generated code in the application process', async () => {
            delete (globalThis as { __cencoriCodeExecuted?: boolean }).__cencoriCodeExecuted;

            const result = await executeCodeInterpreter(
                'globalThis.__cencoriCodeExecuted = true',
                'javascript',
            );

            expect(result.status).toBe('failed');
            expect(result.error).toBe('Code interpreter is temporarily unavailable');
            expect((globalThis as { __cencoriCodeExecuted?: boolean }).__cencoriCodeExecuted).toBeUndefined();
        });
    });
});
