import { describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

/**
 * Every gateway endpoint must log what was sent. A row with no request payload
 * shows up in the console as a request that happened with nothing to inspect —
 * the bug this guard exists to prevent from coming back.
 */

// Guard-blocked parse failures: the request never parsed, so there is nothing
// to log. Each entry is a file plus the number of such sites in it.
const ALLOWED_WITHOUT_PAYLOAD: Record<string, number> = {
    'app/api/ai/vision/route.ts': 1,
    'app/api/ai/vision/ocr/route.ts': 1,
    'app/api/ai/vision/classify/route.ts': 1,
    'app/api/ai/vision/describe/route.ts': 1,
};

function logCallBlocks(source: string): string[] {
    const blocks: string[] = [];
    const re = /logGatewayRequest\((?:ctx|gatewayCtx|activeGatewayCtx)!?,\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
        let depth = 1;
        let i = match.index + match[0].length;
        const start = i;
        while (depth > 0 && i < source.length) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            i++;
        }
        blocks.push(source.slice(start, i));
    }
    return blocks;
}

describe('gateway request logging coverage', () => {
    it('logs a request payload at every call site', () => {
        const files = execSync('grep -rl "logGatewayRequest(" --include="*.ts" app lib', {
            encoding: 'utf8',
        })
            .split('\n')
            .filter(Boolean)
            .filter(f => !f.includes('__tests__') && !f.endsWith('gateway-middleware.ts'));

        expect(files.length).toBeGreaterThan(20);

        const offenders: string[] = [];
        for (const file of files) {
            const blocks = logCallBlocks(readFileSync(file, 'utf8'));
            const missing = blocks.filter(b => !b.includes('requestPayload')).length;
            const allowed = ALLOWED_WITHOUT_PAYLOAD[file] ?? 0;
            if (missing > allowed) {
                offenders.push(`${file}: ${missing} call site(s) without requestPayload (allowed ${allowed})`);
            }
        }

        expect(offenders).toEqual([]);
    });
});
