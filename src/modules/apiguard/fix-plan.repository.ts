import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Injectable } from '@nitrostack/core';
import type { FixPlan } from '../../domain/fix-plan.js';

@Injectable()
export class FixPlanRepository {
  private readonly memoryStore = new Map<string, FixPlan>();

  private filePath(id: string): string {
    return resolve(process.cwd(), '.apiguard', 'fix-plans', `${id}.json`);
  }

  save(plan: FixPlan): FixPlan {
    const clone = structuredClone(plan);
    this.memoryStore.set(plan.id, clone);
    const file = this.filePath(plan.id);
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(clone, null, 2), 'utf8');
    renameSync(temp, file);
    return structuredClone(clone);
  }

  get(id: string): FixPlan | undefined {
    const cached = this.memoryStore.get(id);
    if (cached) return structuredClone(cached);
    const file = this.filePath(id);
    if (!existsSync(file)) return undefined;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as FixPlan;
    this.memoryStore.set(id, parsed);
    return structuredClone(parsed);
  }
}
