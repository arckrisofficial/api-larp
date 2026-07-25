import { Injectable } from '@nitrostack/core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScenarioSpecs } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';

@Injectable({ deps: [ApiGuardConfig] })
export class SpecRepository {
  constructor(private readonly config: ApiGuardConfig) {}

  private scenarioPath(scenarioId: string, file: string): string {
    const id = scenarioId || this.config.demoScenario || 'risky';
    if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error('Invalid scenario identifier.');
    return path.resolve(process.cwd(), this.config.fixturesDir, 'scenarios', id, file);
  }

  private async readJson(file: string): Promise<Record<string, unknown>> {
    const raw = await readFile(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Expected JSON object in ${file}`);
    return parsed as Record<string, unknown>;
  }

  async getScenario(scenarioId?: string): Promise<ScenarioSpecs> {
    const id = scenarioId || this.config.demoScenario || 'risky';
    const [baseline, candidate] = await Promise.all([
      this.readJson(this.scenarioPath(id, 'baseline.openapi.json')),
      this.readJson(this.scenarioPath(id, 'candidate.openapi.json'))
    ]);
    return { scenarioId: id, baseline, candidate };
  }

  async getSpec(scenarioId: string, kind: 'baseline' | 'candidate'): Promise<Record<string, unknown>> {
    const scenario = await this.getScenario(scenarioId);
    return scenario[kind];
  }
}
