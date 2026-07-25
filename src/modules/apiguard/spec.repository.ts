import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nitrostack/core';
import type { ScenarioSpecs } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';

@Injectable({ deps: [ApiGuardConfig] })
export class SpecRepository {
  constructor(private readonly config: ApiGuardConfig) {}

  private scenarioPath(scenarioId: string, file: string): string {
    const id = scenarioId || this.config.demoScenario || 'risky';
    if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error('Invalid scenario identifier.');

    // 1. Check dynamic custom scenario path under .apiguard/scenarios/{id}/
    const customPath = path.resolve(process.cwd(), '.apiguard', 'scenarios', id, file);
    if (existsSync(customPath)) return customPath;

    // 2. Fall back to preset fixture directory
    return path.resolve(process.cwd(), this.config.fixturesDir, 'scenarios', id, file);
  }

  private async readJson(file: string): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Expected JSON object in ${file}`);
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      throw new Error(`Scenario specification file missing or unparseable: ${file}`);
    }
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
  async listScenarios(): Promise<Array<{ id: string; source: 'fixture' | 'registered' }>> {
    const result = new Map<string, { id: string; source: 'fixture' | 'registered' }>();
    const roots: Array<{ dir: string; source: 'fixture' | 'registered' }> = [
      { dir: path.resolve(process.cwd(), this.config.fixturesDir, 'scenarios'), source: 'fixture' },
      { dir: path.resolve(process.cwd(), '.apiguard', 'scenarios'), source: 'registered' }
    ];
    for (const root of roots) {
      try {
        const entries = await readdir(root.dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && /^[a-z0-9_-]+$/i.test(entry.name)) {
            result.set(entry.name, { id: entry.name, source: root.source });
          }
        }
      } catch {
        // Missing optional scenario roots are valid.
      }
    }
    return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

}
