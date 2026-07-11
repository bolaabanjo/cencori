import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        env: {
            NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        },
        include: ['lib/gateway/__tests__/**/*.test.ts', 'lib/memory/__tests__/**/*.test.ts'],
        exclude: ['**/node_modules/**', '.next', 'dist'],
        testTimeout: 15000,
        fileParallelism: false,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
