declare var process: any;
declare var Buffer: { from(input: string | Uint8Array, encoding?: string): { toString(encoding?: string): string } };
declare module 'dotenv/config' {}
declare module 'node:crypto' {
  export function createHash(name:string): { update(value:any): any; digest(encoding:'hex'): string };
  export function randomUUID(): string;
}
declare module 'node:fs' {
  export const existsSync:any; export const mkdirSync:any; export const readFileSync:any; export const readdirSync:any;
  export const renameSync:any; export const writeFileSync:any; export const rmSync:any; export const unlinkSync:any;
}
declare module 'node:fs/promises' {
  export const readFile:any; export const writeFile:any; export const cp:any; export const mkdir:any; export const readdir:any;
}
declare module 'node:path' {
  const path:any; export default path; export const dirname:any; export const resolve:any;
}
declare module '@nitrostack/core' {
  export const z:any; export type ExecutionContext=any;
  export type HealthCheckInterface=any; export type HealthCheckResult=any;
  export function McpApp(o:any):ClassDecorator; export function Module(o:any):ClassDecorator; export function Injectable(o?:any):ClassDecorator;
  export function ToolDecorator(o:any):MethodDecorator; export function ResourceDecorator(o:any):MethodDecorator; export function PromptDecorator(o:any):MethodDecorator;
  export function Widget(n:string):MethodDecorator; export function HealthCheck(o:any):ClassDecorator;
  export const McpApplicationFactory:any;
}
declare module 'zod' { export const z:any; }
declare module 'node:test' {
  export const test:any; export const after:any; const defaultTest:any; export default defaultTest;
}
declare module 'node:assert/strict' { const assert:any; export default assert; }
