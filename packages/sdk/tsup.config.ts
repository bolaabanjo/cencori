import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        'index': 'src/index.ts',
        'vercel/index': 'src/vercel/index.ts',
        'tanstack/index': 'src/tanstack/index.ts',
        'ai/index': 'src/ai/index.ts',
        'vision/index': 'src/vision/index.ts',
        'voice/index': 'src/voice/index.ts',
        'documents/index': 'src/documents/index.ts',
        'react/index': 'src/react/index.ts',
        'compute/index': 'src/compute/index.ts',
        'workflow/index': 'src/workflow/index.ts',
        'storage/index': 'src/storage/index.ts',
        'memory/index': 'src/memory/index.ts',
        'telemetry/index': 'src/telemetry/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom', 'lucide-react'],
});
