import { Injectable } from '@nitrostack/core';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ScenarioSpecs } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';

@Injectable({ deps: [ApiGuardConfig] })
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

  async listScenarios(): Promise<string[]> {
    const scenariosPath = path.resolve(process.cwd(), this.config.fixturesDir, 'scenarios');
    const entries = await readdir(scenariosPath, { withFileTypes: true });
    return entries.filter(e => e.isDirectory() && /^[a-z0-9_-]+$/i.test(e.name)).map(e => e.name);
  }

  async getScenario(scenarioId?: string): Promise<ScenarioSpecs> {
    const id = scenarioId || this.config.demoScenario;
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
