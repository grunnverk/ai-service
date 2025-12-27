#!/usr/bin/env node
/**
 * Example 4: Custom Storage Adapter
 *
 * This example demonstrates how to implement a custom storage adapter
 * to save AI-generated content to a specific location or cloud storage.
 *
 * Usage:
 *   npx tsx examples/04-custom-storage.ts
 */

/* eslint-disable no-console */

import { runAgenticCommit, type StorageAdapter } from '@eldrforge/ai-service';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Custom storage adapter that saves files to a structured output directory
 */
class CustomStorageAdapter implements StorageAdapter {
    private outputDir: string;
    private tempDir: string;

    constructor(outputDir: string, tempDir: string = '/tmp') {
        this.outputDir = outputDir;
        this.tempDir = tempDir;
    }

    async writeOutput(fileName: string, content: string): Promise<void> {
    // Ensure output directory exists
        await fs.mkdir(this.outputDir, { recursive: true });

        const filePath = path.join(this.outputDir, fileName);
        await fs.writeFile(filePath, content, 'utf8');

        console.log(`   📁 Saved to: ${filePath}`);
    }

    async readTemp(fileName: string): Promise<string> {
        const filePath = path.join(this.tempDir, fileName);
        return fs.readFile(filePath, 'utf8');
    }

    async writeTemp(fileName: string, content: string): Promise<void> {
        await fs.mkdir(this.tempDir, { recursive: true });
        const filePath = path.join(this.tempDir, fileName);
        await fs.writeFile(filePath, content, 'utf8');
    }

    async readFile(fileName: string): Promise<string> {
        return fs.readFile(fileName, 'utf8');
    }
}

/**
 * Alternative: Cloud storage adapter (example structure)
 * In a real implementation, you would integrate with AWS S3, Google Cloud Storage, etc.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CloudStorageAdapter implements StorageAdapter {
    async writeOutput(fileName: string, _content: string): Promise<void> {
    // Example: Upload to S3
    // const s3 = new S3Client({ region: 'us-east-1' });
    // await s3.send(new PutObjectCommand({
    //   Bucket: 'my-bucket',
    //   Key: `ai-output/${fileName}`,
    //   Body: content,
    // }));

        console.log(`   ☁️  Would upload to cloud: ${fileName}`);
    }

    async readTemp(fileName: string): Promise<string> {
    // Local temp files
        return fs.readFile(path.join('/tmp', fileName), 'utf8');
    }

    async writeTemp(fileName: string, content: string): Promise<void> {
        await fs.writeFile(path.join('/tmp', fileName), content, 'utf8');
    }

    async readFile(fileName: string): Promise<string> {
        return fs.readFile(fileName, 'utf8');
    }
}

async function main() {
    try {
        console.log('🔍 Checking for staged changes...\n');

        const diffContent = execSync('git diff --staged', { encoding: 'utf8' });

        if (!diffContent.trim()) {
            console.log('❌ No staged changes found.');
            console.log('   Stage some changes first with: git add <files>');
            process.exit(1);
        }

        const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
        const changedFiles = statusOutput
            .split('\n')
            .filter(line => line.trim())
            .map(line => line.substring(3));

        console.log('📝 Files changed:', changedFiles.length);
        console.log('');

        // Create custom storage adapter
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputDir = path.join(process.cwd(), 'output', 'ai-service', timestamp);
        const storage = new CustomStorageAdapter(outputDir);

        console.log('🤖 Generating commit message with custom storage...\n');

        const result = await runAgenticCommit({
            changedFiles,
            diffContent,
            model: 'gpt-4o-mini',
            maxIterations: 10,
            storage,
        });

        console.log('\n✨ Generated Commit Message:\n');
        console.log('─'.repeat(60));
        console.log(result.commitMessage);
        console.log('─'.repeat(60));
        console.log('');

        // Save additional metadata
        console.log('💾 Saving files...\n');

        await storage.writeOutput('commit-message.txt', result.commitMessage);

        await storage.writeOutput(
            'metadata.json',
            JSON.stringify({
                timestamp: new Date().toISOString(),
                iterations: result.iterations,
                toolCallsExecuted: result.toolCallsExecuted,
                model: 'gpt-4o-mini',
                changedFiles,
            }, null, 2)
        );

        // Save tool metrics
        await storage.writeOutput(
            'tool-metrics.json',
            JSON.stringify(result.toolMetrics, null, 2)
        );

        console.log('\n✅ Complete! All files saved to:', outputDir);

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();

