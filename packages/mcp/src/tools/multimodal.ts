import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import { jsonResult, WRITE_ANNOTATIONS } from './shared.js';

/**
 * Multimodal inference tools. These run real model calls that incur cost/usage,
 * so they are Write-tier — registered only when CENCORI_MCP_WRITE is set.
 *
 * NOTE: audio (text_to_speech / transcribe_audio) is intentionally not here yet
 * — those routes deal in binary / multipart bodies and need a binary-aware
 * client path. Tracked as a follow-up.
 */

const messageSchema = z
    .array(
        z.object({
            role: z.enum(['system', 'user', 'assistant']),
            content: z.string(),
        }),
    )
    .min(1)
    .describe('Chat messages in OpenAI format.');

const imageSourceShape = {
    image_url: z.string().url().optional().describe('Public URL of the image.'),
    image_base64: z.string().optional().describe('Base64-encoded image bytes (use with mime_type).'),
    mime_type: z.string().optional().describe('MIME type for image_base64, e.g. image/png.'),
    prompt: z.string().optional().describe('Optional instruction to steer the analysis.'),
    model: z.string().optional().describe('Override the model.'),
};

const documentSourceShape = {
    document_url: z.string().url().optional().describe('Public URL of the PDF/image.'),
    document_base64: z.string().optional().describe('Base64-encoded document bytes (use with mime_type).'),
    mime_type: z.string().optional().describe('MIME type for document_base64, e.g. application/pdf.'),
    model: z.string().optional().describe('Override the model.'),
};

export function registerMultimodalTools(server: McpServer, client: PlatformClient): void {
    server.registerTool(
        'generate_text',
        {
            title: 'Generate text (chat completion)',
            description: 'Run a chat completion through the Cencori gateway. Incurs usage/cost.',
            inputSchema: {
                model: z.string().describe('Model id, e.g. llama-3.1-8b-instant or claude-opus-5.'),
                messages: messageSchema,
                temperature: z.number().min(0).max(2).optional(),
                max_tokens: z.number().int().positive().optional(),
            },
            annotations: WRITE_ANNOTATIONS,
        },
        async ({ model, messages, temperature, max_tokens }) =>
            jsonResult(await client.post('/v1/chat/completions', { model, messages, temperature, max_tokens })),
    );

    server.registerTool(
        'generate_rag',
        {
            title: 'RAG chat over a memory namespace',
            description: 'Answer a question grounded in stored memories for a namespace. Incurs usage/cost.',
            inputSchema: {
                model: z.string().describe('Model id for the answer.'),
                messages: messageSchema,
                namespace: z.string().min(1).describe('Memory namespace to retrieve context from.'),
                limit: z.number().int().positive().optional().describe('Max memories to retrieve.'),
            },
            annotations: WRITE_ANNOTATIONS,
        },
        async ({ model, messages, namespace, limit }) =>
            jsonResult(await client.post('/ai/rag', { model, messages, namespace, limit })),
    );

    server.registerTool(
        'create_embeddings',
        {
            title: 'Create embeddings',
            description: 'Generate vector embeddings for text. Incurs usage/cost.',
            inputSchema: {
                input: z.union([z.string(), z.array(z.string())]).describe('Text or array of texts to embed.'),
                model: z.string().optional().describe('Embedding model. Defaults to text-embedding-3-small.'),
                dimensions: z.number().int().positive().optional(),
            },
            annotations: WRITE_ANNOTATIONS,
        },
        async ({ input, model, dimensions }) =>
            jsonResult(await client.post('/ai/embeddings', { input, model, dimensions })),
    );

    server.registerTool(
        'moderate_content',
        {
            title: 'Moderate content',
            description: 'Classify text for policy violations via the moderation endpoint.',
            inputSchema: {
                input: z.union([z.string(), z.array(z.string())]).describe('Text or array of texts to moderate.'),
                model: z.string().optional(),
            },
            annotations: WRITE_ANNOTATIONS,
        },
        async ({ input, model }) => jsonResult(await client.post('/ai/moderation', { input, model })),
    );

    server.registerTool(
        'generate_image',
        {
            title: 'Generate an image',
            description: 'Generate image(s) from a text prompt. Incurs usage/cost.',
            inputSchema: {
                prompt: z.string().min(1).describe('Text prompt describing the image.'),
                model: z.string().optional(),
                n: z.number().int().positive().optional().describe('Number of images.'),
                size: z.string().optional().describe('Image size, e.g. 1024x1024.'),
            },
            annotations: WRITE_ANNOTATIONS,
        },
        async ({ prompt, model, n, size }) =>
            jsonResult(await client.post('/ai/images/generate', { prompt, model, n, size })),
    );

    // ── Vision ───────────────────────────────────────────────────────────
    for (const [name, path, title] of [
        ['describe_image', '/ai/vision/describe', 'Describe an image'],
        ['ocr_image', '/ai/vision/ocr', 'Extract text from an image (OCR)'],
        ['classify_image', '/ai/vision/classify', 'Classify an image (JSON tags)'],
    ] as const) {
        server.registerTool(
            name,
            {
                title,
                description: `${title} via the Cencori vision endpoint. Incurs usage/cost.`,
                inputSchema: imageSourceShape,
                annotations: WRITE_ANNOTATIONS,
            },
            async (args) => jsonResult(await client.post(path, args)),
        );
    }

    // ── Documents ────────────────────────────────────────────────────────
    server.registerTool(
        'extract_document',
        {
            title: 'Extract text from a document',
            description: 'Extract clean text from a PDF or image (native extraction for text PDFs). Incurs usage/cost for OCR.',
            inputSchema: documentSourceShape,
            annotations: WRITE_ANNOTATIONS,
        },
        async (args) => jsonResult(await client.post('/ai/documents/extract', args)),
    );
    server.registerTool(
        'summarize_document',
        {
            title: 'Summarize a document',
            description: 'Extract and summarize a PDF or image. Incurs usage/cost.',
            inputSchema: { ...documentSourceShape, prompt: z.string().optional().describe('Optional summary instruction.') },
            annotations: WRITE_ANNOTATIONS,
        },
        async (args) => jsonResult(await client.post('/ai/documents/summarize', args)),
    );
    server.registerTool(
        'query_document',
        {
            title: 'Ask a question about a document',
            description: 'Extract a document and answer a question about it. Incurs usage/cost.',
            inputSchema: {
                ...documentSourceShape,
                question: z.string().min(1).describe('The question to answer about the document.'),
            },
            annotations: WRITE_ANNOTATIONS,
        },
        async (args) => jsonResult(await client.post('/ai/documents/query', args)),
    );
}
