import { describe, expect, it } from 'vitest';
import { resolveWebStoreMode } from '../store-mode';

describe('resolveWebStoreMode', () => {
    it('prefers owned PostgreSQL in auto mode when a connection string exists', () => {
        expect(resolveWebStoreMode({
            CENCORI_WEB_DATABASE_URL: 'postgresql://localhost/cencori_web',
        })).toBe('postgres');
    });

    it('falls back to Supabase in auto mode', () => {
        expect(resolveWebStoreMode({})).toBe('supabase');
    });

    it('can force Supabase even when the owned database is configured', () => {
        expect(resolveWebStoreMode({
            CENCORI_WEB_STORE: 'supabase',
            CENCORI_WEB_DATABASE_URL: 'postgresql://localhost/cencori_web',
        })).toBe('supabase');
    });

    it('requires a connection string when PostgreSQL is forced', () => {
        expect(() => resolveWebStoreMode({ CENCORI_WEB_STORE: 'postgres' }))
            .toThrow('CENCORI_WEB_DATABASE_URL is required');
    });

    it('rejects unknown modes', () => {
        expect(() => resolveWebStoreMode({ CENCORI_WEB_STORE: 'other' }))
            .toThrow('CENCORI_WEB_STORE must be auto, postgres, or supabase');
    });
});
