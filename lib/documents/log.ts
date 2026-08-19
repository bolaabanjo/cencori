import { truncateForLog } from '@/lib/gateway/log-payload';
import type { DocumentInput } from './extract';

/**
 * Describe an uploaded document for the request log. The bytes themselves are
 * never logged — a PDF is megabytes and unreadable in a console row.
 */
export function describeDocumentInput(input: DocumentInput, prompt?: string): string {
    const name = input.filename || 'upload';
    const description = `[document: ${name}, ${input.mimeType}, ${input.bytes.length} bytes]`;
    return prompt ? `${description}\n${truncateForLog(prompt)}` : description;
}
