// @vitest-environment node
/**
 * Live check: the OpenAI SDK, pointed at Maximo's endpoint with the headers the
 * chat path uses, accepts an image and answers about it.
 *
 * Not part of CI — it spends money on every run, so it stays skipped unless
 * both the key and an explicit opt-in are present:
 *
 *   MAXIMO_VISION_LIVE=1 MAXIMO_API_KEY=… npx vitest run \
 *     lib/vision/__tests__/maximo-vision-live.manual.test.ts
 */
import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import OpenAI from 'openai';
import {
    OPENAI_COMPATIBLE_ENDPOINTS,
    openAICompatibleHeaders,
} from '@/lib/providers/openai-compatible';

function halfRedHalfBluePng(): string {
    const W = 64, H = 64;
    const raw: number[] = [];
    for (let y = 0; y < H; y++) {
        raw.push(0);
        for (let x = 0; x < W; x++) raw.push(...(x < W / 2 ? [255, 0, 0] : [0, 0, 255]));
    }
    const chunk = (type: string, data: Buffer) => {
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(zlib.crc32(body) >>> 0);
        return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(Buffer.from(raw))),
        chunk('IEND', Buffer.alloc(0)),
    ]);
    return png.toString('base64');
}

const apiKey = process.env.MAXIMO_API_KEY ?? process.env.MAXIMOAI_API_KEY;
const optedIn = process.env.MAXIMO_VISION_LIVE === '1';

describe.skipIf(!apiKey || !optedIn)('Maximo vision over the OpenAI wire format', () => {
    it('reads an image through the shared endpoint + headers', async () => {
        const client = new OpenAI({
            apiKey: apiKey!,
            baseURL: OPENAI_COMPATIBLE_ENDPOINTS.maximo.baseURL,
            timeout: 55_000,
            maxRetries: 0,
            defaultHeaders: openAICompatibleHeaders('maximo'),
        });

        const response = await client.chat.completions.create({
            model: 'maximo-atlas-1.2',
            max_tokens: 40,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: 'Name the color on the left half and on the right half. Five words max.' },
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${halfRedHalfBluePng()}` } },
                ],
            }],
        });

        const answer = response.choices[0]?.message?.content?.toLowerCase() ?? '';
        expect(answer).toContain('red');
        expect(answer).toContain('blue');
    }, 90_000);
});
