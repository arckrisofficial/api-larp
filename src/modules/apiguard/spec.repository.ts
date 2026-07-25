import { Injectable } from '@nitrostack/core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScenarioSpecs } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';

@Injectable()
export class SpecRepository {
  constructor(private readonly config: ApiGuardConfig) {}

  private scenarioPath(scenarioId: string, file: string): string {
    if (!/^[a-z0-9_-]+$/i.test(scenarioId)) throw new Error('Invalid scenario identifier.');
    return path.resolve(process.cwd(), this.config.fixturesDir, 'scenarios', scenarioId, file);
  }

  private async readJson(file: string): Promise<Record<string, unknown>> {
    const raw = await readFile(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Expected JSON object in ${file}`);
    return parsed as Record<string, unknown>;
  }

  async getScenario(scenarioId = this.config.demoScenario): Promise<ScenarioSpecs> {
    const [baseline, candidate] = await Promise.all([
      this.readJson(this.scenarioPath(scenarioId, 'baseline.openapi.json')),
      this.readJson(this.scenarioPath(scenarioId, 'candidate.openapi.json'))
    ]);
    return { scenarioId, baseline, candidate };
  }

  async getSpec(scenarioId: string, kind: 'baseline' | 'candidate'): Promise<Record<string, unknown>> {
    const scenario = await this.getScenario(scenarioId);
    return scenario[kind];
  }
}
