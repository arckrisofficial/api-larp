import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/fixtures', { recursive: true });
await cp('fixtures', 'dist/fixtures', { recursive: true });
console.log('Copied fixture assets to dist/fixtures');
