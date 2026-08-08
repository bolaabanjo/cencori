import { createHash } from 'node:crypto';
import puppeteer, { type HTTPRequest, type KeyInput } from 'puppeteer';
import { assertSafeOutboundUrl, UnsafeOutboundUrlError } from '@/lib/security/outbound-url';
import { extractWebDocument } from './html';
import { assertRobotsAllowed } from './robots';
import { normalizeWebUrl } from './url';
import { WebRuntimeError } from './errors';
import type { FetchedWebResource, WebBrowserAction, WebBrowserOptions } from './types';

const MAX_ACTIONS = 20;
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

function selector(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 500) {
        throw new WebRuntimeError('invalid_browser_action', 'Browser selectors must contain 1 to 500 characters');
    }
    return value;
}

export function validateBrowserOptions(value: unknown): Required<Omit<WebBrowserOptions, 'actions'>> & { actions: WebBrowserAction[] } {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const rawActions = input.actions ?? [];
    if (!Array.isArray(rawActions) || rawActions.length > MAX_ACTIONS) {
        throw new WebRuntimeError('invalid_browser_actions', `actions must contain at most ${MAX_ACTIONS} entries`);
    }
    const actions = rawActions.map((raw): WebBrowserAction => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new WebRuntimeError('invalid_browser_action', 'Each browser action must be an object');
        const action = raw as Record<string, unknown>;
        if (action.type === 'click') return { type: 'click', selector: selector(action.selector) };
        if (action.type === 'type') {
            if (typeof action.text !== 'string' || action.text.length > 10_000) throw new WebRuntimeError('invalid_browser_action', 'Typed text may contain at most 10,000 characters');
            if (/password|passwd|secret|token/i.test(String(action.selector))) {
                throw new WebRuntimeError('sensitive_browser_action', 'Password and secret fields are not supported in persisted browser jobs');
            }
            return { type: 'type', selector: selector(action.selector), text: action.text, clear: action.clear === true };
        }
        if (action.type === 'press') {
            if (typeof action.key !== 'string' || !action.key || action.key.length > 40) throw new WebRuntimeError('invalid_browser_action', 'Keyboard key is invalid');
            return { type: 'press', key: action.key };
        }
        if (action.type === 'select') {
            if (!Array.isArray(action.values) || action.values.length > 20 || action.values.some(item => typeof item !== 'string' || item.length > 500)) {
                throw new WebRuntimeError('invalid_browser_action', 'Select values are invalid');
            }
            return { type: 'select', selector: selector(action.selector), values: action.values as string[] };
        }
        if (action.type === 'waitFor') {
            if (action.selector !== undefined) return { type: 'waitFor', selector: selector(action.selector) };
            const milliseconds = Number(action.milliseconds);
            if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 5_000) {
                throw new WebRuntimeError('invalid_browser_action', 'waitFor milliseconds must be between 0 and 5,000');
            }
            return { type: 'waitFor', milliseconds };
        }
        throw new WebRuntimeError('invalid_browser_action', `Unsupported browser action: ${String(action.type)}`);
    });
    const timeoutMs = Math.min(Math.max(Number(input.timeoutMs) || 30_000, 5_000), 60_000);
    const waitUntil = ['domcontentloaded', 'networkidle0', 'networkidle2'].includes(String(input.waitUntil))
        ? input.waitUntil as 'domcontentloaded' | 'networkidle0' | 'networkidle2'
        : 'networkidle2';
    const rawViewport = input.viewport && typeof input.viewport === 'object' ? input.viewport as Record<string, unknown> : {};
    return {
        actions,
        timeoutMs,
        waitUntil,
        screenshot: input.screenshot === true,
        viewport: {
            width: Math.min(Math.max(Number(rawViewport.width) || 1440, 320), 2560),
            height: Math.min(Math.max(Number(rawViewport.height) || 900, 240), 1600),
        },
    };
}

async function validateBrowserRequest(request: HTTPRequest): Promise<void> {
    const url = request.url();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return request.continue();
    try {
        await assertSafeOutboundUrl(url);
        await request.continue();
    } catch {
        await request.abort('blockedbyclient');
    }
}

export async function executeBrowserExploration(value: string, rawOptions: unknown): Promise<Record<string, unknown>> {
    const url = normalizeWebUrl(value);
    const options = validateBrowserOptions(rawOptions);
    try {
        await assertSafeOutboundUrl(url);
        await assertRobotsAllowed(url);
    } catch (error) {
        if (error instanceof WebRuntimeError) throw error;
        throw new WebRuntimeError('unsafe_url', error instanceof Error ? error.message : 'Unsafe browser URL', 400);
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--disable-dev-shm-usage', '--disable-background-networking', '--no-first-run'],
    });
    try {
        const page = await browser.newPage();
        await page.setViewport(options.viewport);
        await page.setRequestInterception(true);
        page.on('request', request => { void validateBrowserRequest(request); });
        page.setDefaultTimeout(Math.min(options.timeoutMs, 15_000));
        page.setDefaultNavigationTimeout(options.timeoutMs);
        const response = await page.goto(url, { waitUntil: options.waitUntil, timeout: options.timeoutMs });
        if (!response || response.status() >= 400) {
            throw new WebRuntimeError('browser_navigation_failed', `Browser navigation returned HTTP ${response?.status() ?? 'unknown'}`, 422);
        }
        await assertSafeOutboundUrl(page.url());
        await assertRobotsAllowed(page.url());

        for (const action of options.actions) {
            if (action.type === 'click') await page.click(action.selector);
            else if (action.type === 'type') {
                if (action.clear) {
                    await page.click(action.selector, { clickCount: 3 });
                    await page.keyboard.press('Backspace');
                }
                await page.type(action.selector, action.text);
            } else if (action.type === 'press') await page.keyboard.press(action.key as KeyInput);
            else if (action.type === 'select') await page.select(action.selector, ...action.values);
            else if (action.selector) await page.waitForSelector(action.selector, { timeout: 5_000 });
            else await new Promise(resolve => setTimeout(resolve, action.milliseconds || 0));
            await assertSafeOutboundUrl(page.url());
        }

        const body = await page.content();
        const bytes = Buffer.byteLength(body);
        if (bytes > 5 * 1024 * 1024) throw new WebRuntimeError('response_too_large', 'Rendered page exceeds the 5 MiB limit', 413);
        const headers = response.headers();
        const retrievedAt = new Date().toISOString();
        const finalUrl = normalizeWebUrl(page.url());
        const resource: FetchedWebResource = {
            url, finalUrl, statusCode: response.status(), mimeType: 'text/html', body, bytes,
            contentHash: createHash('sha256').update(body).digest('hex'), retrievedAt,
            headers: {
                cacheControl: headers['cache-control'] || null,
                etag: headers.etag || null,
                lastModified: headers['last-modified'] || null,
                xRobotsTag: headers['x-robots-tag'] || null,
            },
        };
        const document = extractWebDocument(resource);
        let screenshot: string | null = null;
        if (options.screenshot) {
            const encoded = await page.screenshot({ encoding: 'base64', fullPage: false, type: 'webp', quality: 75 });
            if (Buffer.byteLength(encoded, 'base64') > MAX_SCREENSHOT_BYTES) throw new WebRuntimeError('screenshot_too_large', 'Screenshot exceeds the 4 MiB limit', 413);
            screenshot = `data:image/webp;base64,${encoded}`;
        }
        return {
            url: document.url, finalUrl, title: document.title, content: document.content,
            contentHash: document.contentHash, retrievedAt, links: document.links,
            evidenceSpans: document.evidenceSpans, screenshot,
        };
    } catch (error) {
        if (error instanceof WebRuntimeError) throw error;
        if (error instanceof UnsafeOutboundUrlError) throw new WebRuntimeError('unsafe_url', error.message, 400);
        throw new WebRuntimeError('browser_failed', error instanceof Error ? error.message : 'Browser exploration failed', 422);
    } finally {
        await browser.close();
    }
}
