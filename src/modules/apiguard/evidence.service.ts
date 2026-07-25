import { Injectable } from '@nitrostack/core';
import type { EvidenceSnapshotV2 } from '../../domain/evidence-snapshot.js';
import type { ApiChange } from '../../domain/types.js';
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

  async discover(scenarioId: string, changes: ApiChange[]): Promise<EvidenceDiscoveryResult> {
    const { result, snapshot } = await this.discoverSnapshot(scenarioId, changes);
    return result;
  }

  async discoverSnapshot(
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

  getSnapshot(snapshotId: string): EvidenceSnapshotV2 | undefined {
    return this.snapshotRepo.get(snapshotId);
  }

  getLatestSnapshot(scenarioId: string): EvidenceSnapshotV2 | undefined {
    return this.snapshotRepo.getLatestForScenario(scenarioId);
  }
}
