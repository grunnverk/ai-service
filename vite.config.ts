import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';
import fs from 'fs';
import path from 'path';

export default defineConfig({
    plugins: [
        dts({
            include: ['src/**/*'],
            exclude: ['src/**/*.test.ts', 'tests/**/*', 'src/**/*.md'],
            outDir: 'dist',
            insertTypesEntry: true,
        }),
        // Custom plugin to copy markdown files
        {
            name: 'copy-markdown',
            writeBundle() {
                // Copy markdown files preserving directory structure
                const copyDir = (src: string, dest: string) => {
                    if (!fs.existsSync(dest)) {
                        fs.mkdirSync(dest, { recursive: true });
                    }

                    const entries = fs.readdirSync(src, { withFileTypes: true });

                    for (const entry of entries) {
                        const srcPath = path.join(src, entry.name);
                        const destPath = path.join(dest, entry.name);

                        if (entry.isDirectory()) {
                            copyDir(srcPath, destPath);
                        } else if (entry.name.endsWith('.md')) {
                            fs.copyFileSync(srcPath, destPath);
                        }
                    }
                };

                // Copy prompts markdown files to dist root
                // (because bundled code in dist/index.js uses __dirname which resolves to dist/)
                copyDir('src/prompts', 'dist');
            }
        }
    ],
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            formats: ['es'],
            fileName: 'index',
        },
        rollupOptions: {
            external: [
                'openai',
                '@riotprompt/riotprompt',
                '@eldrforge/git-tools',
                'winston',
                'fs',
                'fs/promises',
                'path',
                'child_process',
                'os',
                'crypto',
                'url',
            ],
        },
        sourcemap: true,
        minify: false,
    },
});
