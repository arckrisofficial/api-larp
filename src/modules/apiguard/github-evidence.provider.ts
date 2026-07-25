import { randomUUID } from 'node:crypto';
import { Injectable } from '@nitrostack/core';
import type { EvidenceSnapshotResult, EvidenceSnapshotV2 } from '../../domain/evidence-snapshot.js';
import { sha256 } from '../../domain/hash.js';
import type { ApiChange, EvidenceItem } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';
import type { EvidenceDiscoveryResult, EvidenceProvider } from './evidence.provider.js';
import { queriesForChanges } from './evidence.provider.js';
import { RepositoryScopeRepository } from './repository-scope.repository.js';

interface CachedValue {
  expiresAt: number;
  value: EvidenceDiscoveryResult;
  snapshot: EvidenceSnapshotV2;
}

@Injectable({ deps: [ApiGuardConfig, RepositoryScopeRepository] })
export class GitHubEvidenceProvider implements EvidenceProvider {
  private readonly cache = new Map<string, CachedValue>();

  constructor(
    private readonly config: ApiGuardConfig,
    private readonly scopeRepository: RepositoryScopeRepository
  ) {}

  async discover(scenarioId: string, changes: ApiChange[]): Promise<EvidenceDiscoveryResult> {
    const { result } = await this.discoverSnapshot(scenarioId, changes);
    return result;
  }

  async discoverSnapshot(
    scenarioId: string,
    changes: ApiChange[],
    baselineSpecHash = '',
    candidateSpecHash = '',
    forceRefresh = false
  ): Promise<{ result: EvidenceDiscoveryResult; snapshot: EvidenceSnapshotV2 }> {
    if (!this.config.githubToken) throw new Error('GITHUB_TOKEN is required when USE_LIVE_GITHUB=true.');

    const activeRepos = this.scopeRepository.listActive();
    if (!activeRepos.length) {
      throw new Error('No active repositories in scope. Use manage_repository_scope to add repositories.');
    }

    const queries = queriesForChanges(changes);
    const queryPlanHash = sha256(queries);
    const cacheKey = sha256({
      scenarioId,
      repos: activeRepos.map((r) => `${r.owner}/${r.name}@${r.lastKnownCommitSha}`),
      queries
    });

    if (forceRefresh) {
      console.log(`[GitHubEvidenceProvider] Force refresh requested. Evicting cache key ${cacheKey}`);
      this.cache.delete(cacheKey);
    } else {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(`[GitHubEvidenceProvider] Cache HIT for scenario ${scenarioId}`);
        return { result: structuredClone(cached.value), snapshot: structuredClone(cached.snapshot) };
      } else {
        console.log(`[GitHubEvidenceProvider] Cache MISS for scenario ${scenarioId}`);
      }
    }

    let requestCount = 0;
    const request = async (endpoint: string, accept = 'application/vnd.github+json'): Promise<Record<string, unknown>> => {
      requestCount += 1;
      if (requestCount > this.config.githubMaxRequests) {
        throw new Error(`GitHub request budget exceeded (${this.config.githubMaxRequests}).`);
      }
      return this.github(endpoint, accept);
    };

    const items: EvidenceItem[] = [];
    const snapshotResults: EvidenceSnapshotResult[] = [];
    const repositoriesChecked: string[] = [];
    const repositoriesFailed: Array<{ repository: string; errorCode: string }> = [];

    const expectedRepos = activeRepos.map((r) => ({
      owner: r.owner,
      name: r.name,
      branch: r.branch,
      commitSha: r.lastKnownCommitSha
    }));

    const concurrency = 3;
    const chunkedRepos = [];
    for (let i = 0; i < activeRepos.length; i += concurrency) {
      chunkedRepos.push(activeRepos.slice(i, i + concurrency));
    }

    for (const chunk of chunkedRepos) {
      await Promise.all(chunk.map(async (managedRepo) => {
        const repoSlug = `${managedRepo.owner}/${managedRepo.name}`;
        const commitSha = managedRepo.lastKnownCommitSha;
        const defaultBranch = managedRepo.branch;

        try {
          for (const query of queries) {
            const q = `"${query.query}" repo:${repoSlug}`;
            const search = await request(`/search/code?q=${encodeURIComponent(q)}&per_page=${this.config.githubMaxMatchesPerQuery}`);
            const matches = Array.isArray(search.items) ? search.items.slice(0, this.config.githubMaxMatchesPerQuery) : [];

            for (const [index, raw] of matches.entries()) {
              if (!raw || typeof raw !== 'object') continue;
              const item = raw as Record<string, unknown>;
              const filePath = String(item.path ?? '');
              if (!filePath) continue;

              const source = await this.fetchSource(request, managedRepo.owner, managedRepo.name, filePath, commitSha);
              const excerpt = excerptFor(source, query.query, this.config.maxSnippetChars);
              const snippetHash = sha256(excerpt.snippet);
              const evidenceId = `live_${sha256([repoSlug, query.id, filePath, index, commitSha]).slice(0, 12)}`;

              items.push({
                id: evidenceId,
                sourceMode: 'live',
                capturedAt: new Date().toISOString(),
                repository: repoSlug,
                branch: defaultBranch,
                commitSha,
                searchQuery: query.query,
                generatedFromChangeIds: query.changeIds,
                filePath,
                lineStart: excerpt.lineStart,
                lineEnd: excerpt.lineEnd,
                snippet: excerpt.snippet,
                contentHash: snippetHash,
                htmlUrl: typeof item.html_url === 'string' ? item.html_url : undefined
              });

              snapshotResults.push({
                evidenceId,
                repository: repoSlug,
                branch: defaultBranch,
                commitSha,
                queryId: query.id,
                filePath,
                lineStart: excerpt.lineStart,
                lineEnd: excerpt.lineEnd,
                snippet: excerpt.snippet,
                contentHash: snippetHash,
                htmlUrl: typeof item.html_url === 'string' ? item.html_url : undefined
              });
            }
          }
          repositoriesChecked.push(repoSlug);
        } catch (err) {
          repositoriesFailed.push({
            repository: repoSlug,
            errorCode: String(err instanceof Error ? err.message : err).slice(0, 120)
          });
        }
      }));
    }

    const now = new Date().toISOString();
    const snapshotId = `snap_${randomUUID().slice(0, 12)}`;

    const snapshot: EvidenceSnapshotV2 = {
      schemaVersion: 2,
      snapshotId,
      scenarioId,
      origin: 'GITHUB',
      baselineSpecHash,
      candidateSpecHash,
      repositoryScopeVersion: this.scopeRepository.getScope().version,
      queryPlanHash,
      generatedAt: now,
      repositoriesExpected: expectedRepos,
      repositoriesChecked,
      repositoriesFailed,
      queries: queries.map((q) => ({ queryId: q.id, query: q.query, generatedFromChangeIds: q.changeIds })),
      results: snapshotResults
    };

    const limitations = [
      'Live GitHub code search is rate-limited and restricted to active scope repositories.',
      `Repositories checked: ${repositoriesChecked.length}/${activeRepos.length}.`,
      `GitHub requests used: ${requestCount}/${this.config.githubMaxRequests}.`
    ];
    if (repositoriesFailed.length > 0) {
      limitations.push(`Failed repositories (${repositoriesFailed.length}): ${repositoriesFailed.map((f) => f.repository).join(', ')}.`);
    }

    const result: EvidenceDiscoveryResult = { items, sourceMode: 'live', limitations };

    this.cache.set(cacheKey, {
      value: structuredClone(result),
      snapshot: structuredClone(snapshot),
      expiresAt: Date.now() + this.config.githubCacheTtlSeconds * 1000
    });

    return { result, snapshot };
  }

  private async fetchSource(
    request: (endpoint: string, accept?: string) => Promise<Record<string, unknown>>,
    owner: string,
    repository: string,
    filePath: string,
    commitSha: string
  ): Promise<string> {
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(commitSha)}`;
    const payload = await request(endpoint);
    const content = typeof payload.content === 'string' ? payload.content.replace(/\s/g, '') : '';
    if (!content || payload.encoding !== 'base64') {
      throw new Error(`Unable to read source content for ${owner}/${repository}/${filePath}.`);
    }
    return Buffer.from(content, 'base64').toString('utf8');
  }

  private async github(endpoint: string, accept: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://api.github.com${endpoint}`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.githubToken}`,
          Accept: accept,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'api-larp-nitrostack-hackathon'
        }
      });
      
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = response.headers.get('x-ratelimit-reset');
      
      if (!response.ok) {
        if (response.status === 403 && remaining === '0') {
           const resetTime = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'unknown';
           throw new Error(`GitHub rate limit exhausted. Resets at ${resetTime}.`);
        }
        throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
      }
      return await response.json() as Record<string, unknown>;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function excerptFor(source: string, query: string, maxChars: number): { snippet: string; lineStart: number; lineEnd: number } {
  const lines = source.split(/\r?\n/);
  const matchedIndex = lines.findIndex((line) => line.toLowerCase().includes(query.toLowerCase()));
  const index = matchedIndex >= 0 ? matchedIndex : 0;
  const start = Math.max(0, index - 1);
  const end = Math.min(lines.length, index + 2);
  const snippet = lines.slice(start, end).join('\n').slice(0, maxChars);
  return { snippet, lineStart: start + 1, lineEnd: Math.max(start + 1, end) };
}
