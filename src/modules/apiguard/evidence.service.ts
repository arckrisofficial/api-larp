import { Injectable } from '@nitrostack/core';
import type { EvidenceSnapshotV2 } from '../../domain/evidence-snapshot.js';
import type { ApiChange, EvidenceItem } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';
import { EvidenceSnapshotRepository } from './evidence-snapshot.repository.js';
import type { EvidenceDiscoveryResult } from './evidence.provider.js';
import { GitHubEvidenceProvider } from './github-evidence.provider.js';
import { SnapshotEvidenceProvider } from './snapshot-evidence.provider.js';

@Injectable({
  deps: [
    ApiGuardConfig,
    SnapshotEvidenceProvider,
    GitHubEvidenceProvider,
    EvidenceSnapshotRepository
  ]
})
export class EvidenceService {
  constructor(
    private readonly config: ApiGuardConfig,
    private readonly snapshotProvider: SnapshotEvidenceProvider,
    private readonly githubProvider: GitHubEvidenceProvider,
    private readonly snapshotRepo: EvidenceSnapshotRepository
  ) {}

  async collect(
    scenarioId: string,
    changes: ApiChange[],
    baselineSpecHash = '',
    candidateSpecHash = '',
    forceRefresh = false
  ): Promise<{ result: EvidenceDiscoveryResult; snapshot: EvidenceSnapshotV2 }> {
    const pair = this.config.useLiveGitHub
      ? await this.githubProvider.discoverSnapshot(scenarioId, changes, baselineSpecHash, candidateSpecHash, forceRefresh)
      : await this.snapshotProvider.discoverSnapshot(scenarioId, changes, baselineSpecHash, candidateSpecHash);

    this.snapshotRepo.save(pair.snapshot);
    return pair;
  }

  /** Compatibility alias for internal callers from older branches. */
  async discoverSnapshot(
    scenarioId: string,
    changes: ApiChange[],
    baselineSpecHash = '',
    candidateSpecHash = '',
    forceRefresh = false
  ): Promise<{ result: EvidenceDiscoveryResult; snapshot: EvidenceSnapshotV2 }> {
    return this.collect(scenarioId, changes, baselineSpecHash, candidateSpecHash, forceRefresh);
  }

  getSnapshot(snapshotId: string): EvidenceSnapshotV2 | undefined {
    return this.snapshotRepo.get(snapshotId);
  }

  getLatestSnapshot(scenarioId: string): EvidenceSnapshotV2 | undefined {
    return this.snapshotRepo.getLatestForScenario(scenarioId);
  }

  assertSnapshotCompatible(
    snapshot: EvidenceSnapshotV2,
    input: {
      scenarioId: string;
      baselineSpecHash: string;
      candidateSpecHash: string;
      validChangeIds: Iterable<string>;
    }
  ): void {
    if (snapshot.scenarioId !== input.scenarioId) {
      throw new Error(`Evidence snapshot ${snapshot.snapshotId} belongs to contract pair ${snapshot.scenarioId}, not ${input.scenarioId}.`);
    }
    if (snapshot.baselineSpecHash && snapshot.baselineSpecHash !== input.baselineSpecHash) {
      throw new Error(`Evidence snapshot ${snapshot.snapshotId} is stale for the baseline contract. Collect a new snapshot.`);
    }
    if (snapshot.candidateSpecHash && snapshot.candidateSpecHash !== input.candidateSpecHash) {
      throw new Error(`Evidence snapshot ${snapshot.snapshotId} is stale for the candidate contract. Collect a new snapshot.`);
    }

    const validChangeIds = new Set(input.validChangeIds);
    const invalidLinks = snapshot.queries.flatMap((query) =>
      query.generatedFromChangeIds.filter((changeId) => !validChangeIds.has(changeId))
    );
    if (invalidLinks.length > 0) {
      throw new Error(
        `Evidence snapshot ${snapshot.snapshotId} references contract changes that are no longer current: ${[...new Set(invalidLinks)].join(', ')}.`
      );
    }
  }

  toEvidenceItems(snapshot: EvidenceSnapshotV2): EvidenceItem[] {
    const queryMap = new Map(snapshot.queries.map((query) => [query.queryId, query] as const));
    return snapshot.results.map((result) => {
      const query = queryMap.get(result.queryId);
      if (!query) throw new Error(`Evidence snapshot ${snapshot.snapshotId} references unknown query ${result.queryId}.`);
      return {
        id: result.evidenceId,
        sourceMode: snapshot.origin === 'GITHUB' ? 'live' : 'snapshot',
        capturedAt: snapshot.generatedAt,
        repository: result.repository,
        branch: result.branch,
        commitSha: result.commitSha,
        searchQuery: query.query,
        generatedFromChangeIds: [...query.generatedFromChangeIds],
        filePath: result.filePath,
        lineStart: result.lineStart,
        lineEnd: result.lineEnd,
        snippet: result.snippet,
        contentHash: result.contentHash,
        htmlUrl: result.htmlUrl
      };
    });
  }
}
