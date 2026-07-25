import { Injectable } from '@nitrostack/core';
import { sha256 } from '../../domain/hash.js';
import type { ApiChange, EvidenceItem } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';
import type { EvidenceDiscoveryResult, EvidenceProvider, EvidenceSearchQuery } from './evidence.provider.js';
import { queriesForChanges } from './evidence.provider.js';

interface CachedValue {
  expiresAt: number;
  value: EvidenceDiscoveryResult;
}

interface RepositoryMeta {
  owner: string;
  name: string;
  defaultBranch: string;
  commitSha: string;
}

@Injectable({ deps: [ApiGuardConfig] })
export class GitHubEvidenceProvider implements EvidenceProvider {
  private readonly cache = new Map<string, CachedValue>();

  constructor(private readonly config: ApiGuardConfig) {}

  async discover(_scenarioId: string, changes: ApiChange[]): Promise<EvidenceDiscoveryResult> {
    if (!this.config.githubToken) throw new Error('GITHUB_TOKEN is required when USE_LIVE_GITHUB=true.');
    if (!this.config.githubOwner || !this.config.githubRepositories.length) {
      throw new Error('Live GitHub mode requires DEMO_GITHUB_OWNER and DEMO_GITHUB_REPOSITORIES.');
    }

    const queries = queriesForChanges(changes);
    const cacheKey = sha256({
      owner: this.config.githubOwner,
      repositories: this.config.githubRepositories,
      queries
    });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value);

    let requestCount = 0;
    const request = async (endpoint: string, accept = 'application/vnd.github+json'): Promise<Record<string, unknown>> => {
      requestCount += 1;
      if (requestCount > this.config.githubMaxRequests) {
        throw new Error(`GitHub request budget exceeded (${this.config.githubMaxRequests}).`);
      }
      return this.github(endpoint, accept);
    };

    const items: EvidenceItem[] = [];
    const repositories: RepositoryMeta[] = [];
    for (const repository of this.config.githubRepositories) {
      const encodedOwner = encodeURIComponent(this.config.githubOwner);
      const encodedRepo = encodeURIComponent(repository);
      const repoPayload = await request(`/repos/${encodedOwner}/${encodedRepo}`);
      const defaultBranch = String(repoPayload.default_branch ?? 'main');
      const commitPayload = await request(`/repos/${encodedOwner}/${encodedRepo}/commits/${encodeURIComponent(defaultBranch)}`);
      const commitSha = String(commitPayload.sha ?? '');
      if (!commitSha) throw new Error(`GitHub did not return a commit SHA for ${repository}.`);
      repositories.push({ owner: this.config.githubOwner, name: repository, defaultBranch, commitSha });

      for (const query of queries) {
        const q = `"${query.query}" repo:${this.config.githubOwner}/${repository}`;
        const search = await request(`/search/code?q=${encodeURIComponent(q)}&per_page=${this.config.githubMaxMatchesPerQuery}`);
        const matches = Array.isArray(search.items) ? search.items.slice(0, this.config.githubMaxMatchesPerQuery) : [];
        for (const [index, raw] of matches.entries()) {
          if (!raw || typeof raw !== 'object') continue;
          const item = raw as Record<string, unknown>;
          const filePath = String(item.path ?? '');
          if (!filePath) continue;
          const source = await this.fetchSource(request, repository, filePath, commitSha);
          const excerpt = excerptFor(source, query.query, this.config.maxSnippetChars);
          items.push({
            id: `live_${sha256([repository, query.id, filePath, index, commitSha]).slice(0, 12)}`,
            sourceMode: 'live',
            capturedAt: new Date().toISOString(),
            repository: `${this.config.githubOwner}/${repository}`,
            branch: defaultBranch,
            commitSha,
            searchQuery: query.query,
            generatedFromChangeIds: query.changeIds,
            filePath,
            lineStart: excerpt.lineStart,
            lineEnd: excerpt.lineEnd,
            snippet: excerpt.snippet,
            contentHash: sha256(excerpt.snippet),
            htmlUrl: typeof item.html_url === 'string' ? item.html_url : undefined
          });
        }
      }
    }

    const value: EvidenceDiscoveryResult = {
      items,
      sourceMode: 'live',
      limitations: [
        'Live GitHub code search is rate-limited and restricted to the configured public repository allow-list.',
        'Search hits are scoped evidence and do not guarantee complete dependency discovery.',
        `GitHub requests used: ${requestCount}/${this.config.githubMaxRequests}.`
      ]
    };
    this.cache.set(cacheKey, {
      value: structuredClone(value),
      expiresAt: Date.now() + this.config.githubCacheTtlSeconds * 1000
    });
    return value;
  }

  private async fetchSource(
    request: (endpoint: string, accept?: string) => Promise<Record<string, unknown>>,
    repository: string,
    filePath: string,
    commitSha: string
  ): Promise<string> {
    const endpoint = `/repos/${encodeURIComponent(this.config.githubOwner)}/${encodeURIComponent(repository)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(commitSha)}`;
    const payload = await request(endpoint);
    const content = typeof payload.content === 'string' ? payload.content.replace(/\s/g, '') : '';
    if (!content || payload.encoding !== 'base64') {
      throw new Error(`Unable to read source content for ${repository}/${filePath}.`);
    }
    return Buffer.from(content, 'base64').toString('utf8');
  }

  private async github(endpoint: string, accept: string): Promise<Record<string, unknown>> {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.config.githubToken}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'api-larp-nitrostack-hackathon'
      }
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
    return await response.json() as Record<string, unknown>;
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

export function buildSnapshotQuery(query: EvidenceSearchQuery): { queryId: string; query: string; generatedFromChangeIds: string[] } {
  return { queryId: query.id, query: query.query, generatedFromChangeIds: query.changeIds };
}
