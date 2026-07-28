import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import { jsonResult, WRITE_ANNOTATIONS } from './shared.js';

/**
 * Audio inference tools (Write-tier). TTS returns binary audio (surfaced as an
 * MCP audio content block); STT uploads audio as multipart/form-data. Both
 * incur usage/cost, so they register only when CENCORI_MCP_WRITE is set.
 */
export function registerAudioTools(server: McpServer, client: PlatformClient): void {
    server.registerTool(
        'text_to_speech',
        {
            title: 'Text to speech',
            description: 'Synthesize speech from text. Returns audio. Incurs usage/cost.',
            inputSchema: {
                input: z.string().min(1).describe('The text to speak.'),
                model: z.string().optional().describe('TTS model. Defaults to tts-1.'),
                voice: z.string().optional().describe('Voice id/name (provider-specific).'),
                response_format: z.string().optional().describe('Audio format, e.g. mp3, wav, opus.'),
                provider: z.string().optional().describe('Override the TTS provider.'),
            },
            annotations: WRITE_ANNOTATIONS,
        },
        async ({ input, model, voice, response_format, provider }) => {
            const { base64, mimeType } = await client.postBinary('/ai/audio/speech', {
                input,
                model,
                voice,
                response_format,
                provider,
            });
            return {
                content: [
                    { type: 'audio' as const, data: base64, mimeType },
                    { type: 'text' as const, text: `Synthesized ${input.length} chars → ${mimeType} (${base64.length} b64 bytes).` },
                ],
            };
        },
    );

    server.registerTool(
        'transcribe_audio',
        {
            title: 'Transcribe audio (speech to text)',
            description: 'Transcribe base64-encoded audio to text. Incurs usage/cost.',
            inputSchema: {
                audio_base64: z.string().min(1).describe('Base64-encoded audio bytes.'),
                mime_type: z.string().optional().describe('Audio MIME type, e.g. audio/mpeg, audio/wav.'),
                filename: z.string().optional().describe('Original filename (helps format detection).'),
                model: z.string().optional().describe('STT model. Defaults to whisper-1.'),
                language: z.string().optional().describe('ISO language code, e.g. en.'),
                prompt: z.string().optional().describe('Optional prompt to guide transcription.'),
                response_format: z
                    .enum(['json', 'text', 'srt', 'verbose_json', 'vtt'])
                    .optional()
                    .describe('Transcript format. verbose_json adds segments/words.'),
                temperature: z.number().min(0).max(1).optional(),
                provider: z.string().optional().describe('Override the STT provider.'),
            },
            annotations: WRITE_ANNOTATIONS,
        },
        async ({ audio_base64, mime_type, filename, model, language, prompt, response_format, temperature, provider }) => {
            const bytes = Buffer.from(audio_base64, 'base64');
            const form = new FormData();
            form.append('file', new Blob([bytes], { type: mime_type || 'application/octet-stream' }), filename || 'audio');
            if (model) form.append('model', model);
            if (language) form.append('language', language);
            if (prompt) form.append('prompt', prompt);
            if (response_format) form.append('response_format', response_format);
            if (temperature !== undefined) form.append('temperature', String(temperature));
            if (provider) form.append('provider', provider);
            return jsonResult(await client.postForm('/ai/audio/transcriptions', form));
        },
    );
}
