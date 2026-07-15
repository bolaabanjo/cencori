import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        env: {
            NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        },
        include: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
        exclude: [
            '**/node_modules/**',
            'node_modules',
            '.next',
            'dist',
            'eve/**',
            'tmp/**',
            '.claude/**',
            '__tests__/integration/**',
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules',
                '.next',
                'dist',
                '**/*.d.ts',
                '**/*.config.*',
                '**/types/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
