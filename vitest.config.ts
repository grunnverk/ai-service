import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // Add pool configuration to prevent memory issues
        pool: 'forks',
        poolOptions: {
            forks: {
                maxForks: 2,
                minForks: 1
            }
        },
        // Add test timeout and memory limits
        testTimeout: 30000,
        hookTimeout: 10000,
        teardownTimeout: 10000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'tests/**/*',
                'src/types.ts',
                'src/**/index.ts', // Index files are just exports
            ],
            thresholds: {
                lines: 90,
                functions: 90,
                branches: 85,
                statements: 90,
            },
        },
    },
});
