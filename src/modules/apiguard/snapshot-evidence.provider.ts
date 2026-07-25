import { Injectable } from '@nitrostack/core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '../../domain/hash.js';
import type { ApiChange, EvidenceItem } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';
import { EvidenceSnapshotSchema, type EvidenceSnapshot } from './evidence.schemas.js';
import type { EvidenceDiscoveryResult, EvidenceProvider } from './evidence.provider.js';

@Injectable({ deps: [ApiGuardConfig] })
export class SnapshotEvidenceProvider implements EvidenceProvider {
  constructor(private readonly config: ApiGuardConfig) {}

  async loadSnapshot(scenarioId?: string): Promise<EvidenceSnapshot> {
    const id = scenarioId || this.config.demoScenario;
    const file = path.resolve(process.cwd(), this.config.fixturesDir, 'scenarios', id, 'evidence.snapshot.json');
    return EvidenceSnapshotSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  }

  async discover(scenarioId: string | undefined, changes: ApiChange[]): Promise<EvidenceDiscoveryResult> {
    const id = scenarioId || this.config.demoScenario;
    const snapshot = await this.loadSnapshot(id);
    const queryMap = new Map(snapshot.queries.map((query) => [query.queryId, query] as const));
    const validChangeIds = new Set(changes.map((change) => change.id));
    const items: EvidenceItem[] = snapshot.results.map((result) => {
      const query = queryMap.get(result.queryId);
      if (!query) throw new Error(`Snapshot result references unknown query ${result.queryId}`);
      if (sha256(result.snippet) !== result.contentHash) {
        throw new Error(`Snapshot content hash mismatch for ${result.evidenceId}`);
      }
      return {
        id: result.evidenceId,
        sourceMode: 'snapshot',
        capturedAt: snapshot.generatedAt,
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
    return {
      items,
      sourceMode: 'snapshot',
      limitations: [
        snapshot.origin === 'fixture'
          ? 'The bundled offline snapshot is derived from demonstration consumer fixtures. Run npm run snapshot:refresh after publishing the demo repositories to generate GitHub provenance.'
          : 'Evidence was captured from the configured GitHub repository scope and pinned commits.',
        'Evidence is limited to the configured repository scope and pinned snapshot commits.',
        'Text search can miss generated clients, dynamic access and repositories outside the configured scope.'
      ]
    };
  }
}
