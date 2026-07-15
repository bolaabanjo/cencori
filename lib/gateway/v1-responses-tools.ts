/**
 * Built-in tool implementations for OpenAI Responses API.
 * Tools: web_search_preview, file_search, code_interpreter
 */

import { createAdminClient } from '@/lib/supabaseAdmin';
import { readResponseBuffer, safeOutboundFetch } from '@/lib/security/outbound-url';

// ── File Indexing (for file_search uploads) ──

export async function indexFileContent(
    projectId: string,
    filename: string,
    content: string,
): Promise<void> {
    const supabase = createAdminClient();
    const chunks = chunkText(content, 2000);
    const uploadId = crypto.randomUUID();

    const records = chunks.map((chunk, i) => ({
        project_id: projectId,
        upload_id: uploadId,
        filename,
        content: chunk,
        chunk_index: i,
        total_chunks: chunks.length,
        metadata: { filename, chunk_index: i, total_chunks: chunks.length },
    }));

    const { error } = await supabase.from('gateway_file_chunks').insert(records);
    if (error) throw error;
}

function chunkText(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        let end = Math.min(start + maxLen, text.length);
        if (end < text.length) {
            const breakAt = text.lastIndexOf('\n', end);
            if (breakAt > start) end = breakAt;
        }
        chunks.push(text.slice(start, end));
        start = end;
    }
    return chunks;
}

// ── Types ──

export type WebSearchToolConfig = {
    type: 'web_search_preview';
    search_context_size?: 'low' | 'medium' | 'high';
    user_location?: {
        type: 'approximate';
        country?: string;
        city?: string;
        region?: string;
    };
};

export type FileSearchToolConfig = {
    type: 'file_search';
    max_num_results?: number;
    filters?: Record<string, unknown>;
};

export type CodeInterpreterToolConfig = {
    type: 'code_interpreter';
};

export type ResponsesBuiltInTool =
    | WebSearchToolConfig
    | FileSearchToolConfig
    | CodeInterpreterToolConfig;

export type ToolCallOutput = {
    type: 'web_search_call' | 'file_search_call' | 'code_interpreter_call';
    id: string;
    status: 'completed' | 'failed';
    output?: Record<string, unknown>;
    error?: string;
};

// ── Web Search Preview ──

const SEARCH_API_ENDPOINT = process.env.SEARCH_API_ENDPOINT || 'https://api.duckduckgo.com';
const SEARCH_API_KEY = process.env.SEARCH_API_KEY;

export async function executeWebSearch(
    query: string,
    config: WebSearchToolConfig
): Promise<ToolCallOutput> {
    const callId = `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    try {
        const results = await performWebSearch(query, config.search_context_size || 'medium');
        return {
            type: 'web_search_call',
            id: callId,
            status: 'completed',
            output: {
                query,
                results,
                search_context_size: config.search_context_size || 'medium',
            },
        };
    } catch (error) {
        return {
            type: 'web_search_call',
            id: callId,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Web search failed',
        };
    }
}

async function performWebSearch(
    query: string,
    contextSize: 'low' | 'medium' | 'high'
): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const numResults = contextSize === 'low' ? 3 : contextSize === 'medium' ? 8 : 15;

    if (!SEARCH_API_KEY) {
        throw new Error('Web search is not configured for this deployment');
    }

    const endpoint = new URL('/search', SEARCH_API_ENDPOINT);
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('count', String(numResults));
    const response = await safeOutboundFetch(endpoint, {
        headers: { 'Authorization': `Bearer ${SEARCH_API_KEY}` },
        signal: AbortSignal.timeout(15_000),
    }, { maxRedirects: 1 });
    if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`Web search provider returned HTTP ${response.status}`);
    }

    const body = await readResponseBuffer(response, 2 * 1024 * 1024);
    const data = JSON.parse(body.toString('utf8')) as {
        results?: Array<{ title?: unknown; url?: unknown; snippet?: unknown }>;
    };
    if (!Array.isArray(data.results)) return [];
    return data.results
        .filter((item): item is { title: string; url: string; snippet: string } =>
            typeof item.title === 'string'
            && typeof item.url === 'string'
            && typeof item.snippet === 'string')
        .slice(0, numResults);
}

function formatSearchResultsForContext(
    results: Array<{ title: string; url: string; snippet: string }>,
    query: string
): string {
    if (results.length === 0) {
        return `[Web search for "${query}" returned no results.]`;
    }
    const lines = results.map(
        (r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
    );
    return `Web search results for "${query}":\n\n${lines.join('\n\n')}`;
}

// ── File Search ──

export async function executeFileSearch(
    query: string,
    projectId: string,
    config: FileSearchToolConfig
): Promise<ToolCallOutput> {
    const callId = `fs_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    try {
        const supabase = createAdminClient();
        const maxResults = config.max_num_results || 5;

        const { data, error } = await supabase.rpc('search_gateway_file_chunks', {
            p_project_id: projectId,
            p_query: query,
            p_limit: maxResults,
            p_filters: config.filters || {},
        });
        if (error) throw new Error(error.message);

        const results = (Array.isArray(data) ? data : []).map(d => ({
            file_name: d.filename || 'file',
            content: d.content || '',
            score: Number(d.score) || 0,
        }));

        return {
            type: 'file_search_call',
            id: callId,
            status: 'completed',
            output: {
                query,
                results,
                total_results: results.length,
            },
        };
    } catch (error) {
        return {
            type: 'file_search_call',
            id: callId,
            status: 'failed',
            error: error instanceof Error ? error.message : 'File search failed',
        };
    }
}

function formatFileSearchResultsForContext(
    results: Array<{ file_name: string; content: string; score: number }>,
    query: string
): string {
    if (results.length === 0) {
        return `[File search for "${query}" returned no results.]`;
    }
    const lines = results.map(
        (r, i) => `[Source ${i + 1}: ${r.file_name}]\n${r.content}`
    );
    return `Retrieved context for "${query}":\n\n${lines.join('\n\n')}`;
}

// ── Code Interpreter ──

export async function executeCodeInterpreter(
    _code: string,
    _language?: string
): Promise<ToolCallOutput> {
    const callId = `ci_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    // Never execute model-generated code in the application process. This tool
    // must remain unavailable until it is backed by a separately isolated
    // runtime with no application credentials, network access, or shared disk.
    return {
        type: 'code_interpreter_call',
        id: callId,
        status: 'failed',
        error: 'Code interpreter is temporarily unavailable',
    };
}

// ── Tool Orchestration ──

export type ToolPreProcessResult = {
    systemContext: string;
    toolOutputs: ToolCallOutput[];
};

export async function preProcessBuiltInTools(
    input: string,
    tools: ResponsesBuiltInTool[],
    projectId: string
): Promise<ToolPreProcessResult> {
    const systemContexts: string[] = [];
    const toolOutputs: ToolCallOutput[] = [];

    for (const tool of tools) {
        switch (tool.type) {
            case 'web_search_preview': {
                const result = await executeWebSearch(input, tool);
                toolOutputs.push(result);
                if (result.status === 'completed' && result.output?.results) {
                    systemContexts.push(
                        formatSearchResultsForContext(
                            result.output.results as Array<{ title: string; url: string; snippet: string }>,
                            input
                        )
                    );
                }
                break;
            }
            case 'file_search': {
                const result = await executeFileSearch(input, projectId, tool);
                toolOutputs.push(result);
                if (result.status === 'completed' && result.output?.results) {
                    systemContexts.push(
                        formatFileSearchResultsForContext(
                            result.output.results as Array<{ file_name: string; content: string; score: number }>,
                            input
                        )
                    );
                }
                break;
            }
            case 'code_interpreter':
                // Code interpreter runs on-demand when the model generates code,
                // not pre-processed. Handled in the execution loop.
                break;
        }
    }

    return {
        systemContext: systemContexts.join('\n\n'),
        toolOutputs,
    };
}
