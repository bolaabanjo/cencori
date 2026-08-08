/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { UnsafeOutboundUrlError } from '@/lib/security/outbound-url';
import { normalizeWebFetchError } from '@/lib/web/fetch';

describe('web fetch retry classification', () => {
    it('reports transient DNS resolution failures as retryable service errors', async () => {
        const error = normalizeWebFetchError(new UnsafeOutboundUrlError('URL hostname could not be resolved'));
        expect(error).toMatchObject({ code: 'dns_unavailable', status: 503 });
    });
});
