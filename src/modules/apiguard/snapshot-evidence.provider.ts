import { Injectable } from '@nitrostack/core';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvidenceSnapshotV2 } from '../../domain/evidence-snapshot.js';
import { sha256 } from '../../domain/hash.js';
import type { ApiChange, EvidenceItem } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';
import type { EvidenceDiscoveryResult, EvidenceProvider } from './evidence.provider.js';
import { queriesForChanges } from './evidence.provider.js';
import { EvidenceSnapshotSchema, type EvidenceSnapshot } from './evidence.schemas.js';

@Injectable({ deps: [ApiGuardConfig] })
export class SnapshotEvidenceProvider implements EvidenceProvider {
  constructor(private readonly config: ApiGuardConfig) {}

  async loadSnapshot(scenarioId?: string): Promise<EvidenceSnapshot> {
    const id = scenarioId || this.config.demoScenario || 'risky';
    const file = path.resolve(process.cwd(), this.config.fixturesDir, 'scenarios', id, 'evidence.snapshot.json');
    return EvidenceSnapshotSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  }

  async discover(scenarioId: string, changes: ApiChange[]): Promise<EvidenceDiscoveryResult> {
    const { result } = await this.discoverSnapshot(scenarioId, changes);
    return result;
  }

  async discoverSnapshot(
    scenarioId: string,
    changes: ApiChange[],
    baselineSpecHash = '',
    candidateSpecHash = ''
  ): Promise<{ result: EvidenceDiscoveryResult; snapshot: EvidenceSnapshotV2 }> {
    const fixturePath = path.resolve(process.cwd(), this.config.fixturesDir, 'scenarios', scenarioId, 'evidence.snapshot.json');
    if (!existsSync(fixturePath)) {
      const queries = queriesForChanges(changes);
      const limitations = [
        `No bundled evidence snapshot exists for contract pair ${scenarioId}.`,
        'The deterministic contract diff is available, but consumer impact remains incomplete until live GitHub evidence or a generated snapshot is supplied.'
      ];
      const snapshot: EvidenceSnapshotV2 = {
        schemaVersion: 2,
        snapshotId: `snap_empty_${scenarioId}_${sha256([baselineSpecHash, candidateSpecHash, queries]).slice(0, 10)}`,
        scenarioId,
        origin: 'FIXTURE',
        baselineSpecHash,
        candidateSpecHash,
        repositoryScopeVersion: 0,
        queryPlanHash: sha256(queries),
        generatedAt: new Date().toISOString(),
        repositoriesExpected: [],
        repositoriesChecked: [],
        repositoriesFailed: [],
        limitations,
        queries: queries.map((query) => ({
          queryId: query.id,
          query: query.query,
          generatedFromChangeIds: query.changeIds
        })),
        results: []
      };
      return {
        snapshot,
        result: {
          items: [],
          sourceMode: 'snapshot',
          limitations
        }
      };
    }

    const rawSnapshot = await this.loadSnapshot(scenarioId);
    const queryMap = new Map(rawSnapshot.queries.map((query) => [query.queryId, query] as const));
    const validChangeIds = new Set(changes.map((change) => change.id));

    const items: EvidenceItem[] = rawSnapshot.results.map((result) => {
      const query = queryMap.get(result.queryId);
      if (!query) throw new Error(`Snapshot result references unknown query ${result.queryId}`);
      if (sha256(result.snippet) !== result.contentHash) {
        throw new Error(`Snapshot content hash mismatch for ${result.evidenceId}`);
      }
      return {
        id: result.evidenceId,
        sourceMode: 'snapshot',
        capturedAt: rawSnapshot.generatedAt,
        repository: result.repository,
        branch: result.branch,
        commitSha: result.commitSha,
        searchQuery: query.query,
        generatedFromChangeIds: query.generatedFromChangeIds.filter((id: string) => validChangeIds.has(id)),
        filePath: result.filePath,
        lineStart: result.lineStart,
        lineEnd: result.lineEnd,
        snippet: result.snippet,
        contentHash: result.contentHash,
        htmlUrl: result.htmlUrl
      };
    });

    const expectedRepositories = rawSnapshot.repositories.map((repository) => ({
      owner: repository.owner,
      name: repository.name,
      branch: repository.defaultBranch,
      commitSha: repository.commitSha
    }));
    const checkedRepositories = expectedRepositories.map((repository) => `${repository.owner}/${repository.name}`);

    const limitations = [
      rawSnapshot.origin === 'fixture'
        ? 'The bundled offline snapshot is derived from demonstration consumer fixtures. Run npm run snapshot:refresh during development, or enable live GitHub mode for configured repositories.'
        : 'Evidence was captured from the configured GitHub repository scope and pinned commits.',
      'Evidence is limited to the configured repository scope and pinned snapshot commits.'
    ];

    const snapshotV2: EvidenceSnapshotV2 = {
      schemaVersion: 2,
      snapshotId: `snap_fixture_${scenarioId}`,
      scenarioId,
      origin: 'FIXTURE',
      baselineSpecHash,
      candidateSpecHash,
      repositoryScopeVersion: 0,
      queryPlanHash: sha256(rawSnapshot.queries),
      generatedAt: rawSnapshot.generatedAt,
      repositoriesExpected: expectedRepositories,
      repositoriesChecked: checkedRepositories,
      repositoriesFailed: [],
      limitations,
      queries: rawSnapshot.queries.map((q) => ({ queryId: q.queryId, query: q.query, generatedFromChangeIds: q.generatedFromChangeIds })),
      results: rawSnapshot.results.map((r) => ({
        evidenceId: r.evidenceId,
        repository: r.repository,
        branch: r.branch,
        commitSha: r.commitSha,
        queryId: r.queryId,
        filePath: r.filePath,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        snippet: r.snippet,
        contentHash: r.contentHash,
        htmlUrl: r.htmlUrl
      }))
    };

    const result: EvidenceDiscoveryResult = {
      items,
      sourceMode: 'snapshot',
      limitations
    };

    return { result, snapshot: snapshotV2 };
  }
}
