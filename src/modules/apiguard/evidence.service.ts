import { Injectable } from '@nitrostack/core';
import type { ApiChange } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';
import type { EvidenceDiscoveryResult } from './evidence.provider.js';
import { GitHubEvidenceProvider } from './github-evidence.provider.js';
import { SnapshotEvidenceProvider } from './snapshot-evidence.provider.js';

@Injectable()
export class EvidenceService {
  constructor(
    private readonly config: ApiGuardConfig,
    private readonly snapshotProvider: SnapshotEvidenceProvider,
    private readonly githubProvider: GitHubEvidenceProvider
  ) {}

  async discover(scenarioId: string, changes: ApiChange[]): Promise<EvidenceDiscoveryResult> {
    return this.config.useLiveGitHub
      ? this.githubProvider.discover(scenarioId, changes)
      : this.snapshotProvider.discover(scenarioId, changes);
  }

  async discoverLive(scenarioId: string, changes: ApiChange[]): Promise<EvidenceDiscoveryResult> {
    return this.githubProvider.discover(scenarioId, changes);
  }
}
