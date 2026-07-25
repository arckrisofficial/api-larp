declare var process: any;
declare var Buffer: { from(input: string | Uint8Array, encoding?: string): { toString(encoding?: string): string } };
declare module 'node:crypto' { export function createHash(name:string): { update(value:any): any; digest(encoding:'hex'): string }; export function randomUUID(): string; }
declare module 'node:fs' { export const existsSync:any; export const mkdirSync:any; export const readFileSync:any; export const readdirSync:any; export const renameSync:any; export const writeFileSync:any; export const rmSync:any; export const unlinkSync:any; }
declare module 'node:fs/promises' { export const readFile:any; export const writeFile:any; export const mkdir:any; export const readdir:any; }
declare module 'node:path' { const path:any; export default path; export const dirname:any; export const resolve:any; }
declare module 'node:test' { export const test:any; export const after:any; const testDefault:any; export default testDefault; }
declare module 'node:assert/strict' { const assert: any; export default assert; }
declare module '@nitrostack/core' { export const z:any; export function Injectable(o?:any):ClassDecorator; }
declare module 'zod' { export const z:any; }
