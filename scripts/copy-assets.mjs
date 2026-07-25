import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist/fixtures', { recursive: true });
await cp('fixtures', 'dist/fixtures', { recursive: true });

await mkdir('dist/demo-repositories', { recursive: true });
await cp('demo-repositories', 'dist/demo-repositories', { recursive: true });

process.stdout.write('Copied fixture and demo-repository assets to dist/.\n');
