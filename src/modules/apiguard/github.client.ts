import { Injectable } from '@nitrostack/core';
import { ApiGuardConfig } from './config.service.js';

export interface GitHubFile {
  path: string;
  sha: string;
  content: string;
}

export interface GitHubRepositoryInfo {
  defaultBranch: string;
  private: boolean;
}

export interface GitHubPullRequestResult {
  number: number;
  htmlUrl: string;
}

@Injectable({ deps: [ApiGuardConfig] })
export class GitHubClient {
  constructor(private readonly config: ApiGuardConfig) {}

  async getRepository(owner: string, repository: string): Promise<GitHubRepositoryInfo> {
    const payload = await this.request('GET', `/repos/${enc(owner)}/${enc(repository)}`);
    return {
      defaultBranch: String(payload.default_branch ?? 'main'),
      private: payload.private === true
    };
  }

  async getBranchHead(owner: string, repository: string, branch: string): Promise<string> {
    const payload = await this.request('GET', `/repos/${enc(owner)}/${enc(repository)}/git/ref/heads/${encodePath(branch)}`);
    const object = isRecord(payload.object) ? payload.object : {};
    const sha = typeof object.sha === 'string' ? object.sha : '';
    if (!sha) throw new Error(`GitHub did not return a head SHA for ${owner}/${repository}:${branch}.`);
    return sha;
  }

  async getFile(owner: string, repository: string, filePath: string, ref: string): Promise<GitHubFile> {
    const payload = await this.request('GET', `/repos/${enc(owner)}/${enc(repository)}/contents/${encodePath(filePath)}?ref=${enc(ref)}`);
    if (payload.type !== 'file' || typeof payload.sha !== 'string' || typeof payload.content !== 'string' || payload.encoding !== 'base64') {
      throw new Error(`GitHub content response was not a file: ${owner}/${repository}/${filePath}.`);
    }
    return {
      path: filePath,
      sha: payload.sha,
      content: Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8')
    };
  }

  async createBranch(owner: string, repository: string, branch: string, baseCommitSha: string): Promise<void> {
    try {
      await this.request('POST', `/repos/${enc(owner)}/${enc(repository)}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: baseCommitSha
      });
    } catch (error) {
      // Safe retry support: a previous partial attempt may already have created the branch.
      try {
        const existingHead = await this.getBranchHead(owner, repository, branch);
        if (existingHead === baseCommitSha) return;
        throw new Error(`Branch ${branch} already exists at ${existingHead}, expected ${baseCommitSha}.`);
      } catch (lookupError) {
        if (lookupError instanceof Error && lookupError.message.startsWith(`Branch ${branch} already exists`)) {
          throw lookupError;
        }
        throw error;
      }
    }
  }

  async updateFile(
    owner: string,
    repository: string,
    input: { filePath: string; branch: string; originalBlobSha: string; content: string; message: string }
  ): Promise<string> {
    const payload = await this.request('PUT', `/repos/${enc(owner)}/${enc(repository)}/contents/${encodePath(input.filePath)}`, {
      message: input.message,
      content: Buffer.from(input.content, 'utf8').toString('base64'),
      branch: input.branch,
      sha: input.originalBlobSha
    });
    const commit = isRecord(payload.commit) ? payload.commit : {};
    const sha = typeof commit.sha === 'string' ? commit.sha : '';
    if (!sha) throw new Error(`GitHub did not return a commit SHA after updating ${input.filePath}.`);
    return sha;
  }

  async createPullRequest(
    owner: string,
    repository: string,
    input: { title: string; body: string; head: string; base: string; draft: boolean }
  ): Promise<GitHubPullRequestResult> {
    const payload = await this.request('POST', `/repos/${enc(owner)}/${enc(repository)}/pulls`, {
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
      draft: input.draft,
      maintainer_can_modify: true
    });
    if (typeof payload.number !== 'number' || typeof payload.html_url !== 'string') {
      throw new Error(`GitHub did not return a pull request for ${owner}/${repository}.`);
    }
    return { number: payload.number, htmlUrl: payload.html_url };
  }

  private async request(method: string, endpoint: string, body?: unknown): Promise<Record<string, any>> {
    if (!this.config.githubToken) throw new Error('GITHUB_TOKEN is required for GitHub API access.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.config.githubApiBaseUrl}${endpoint}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.githubToken}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': this.config.githubApiVersion,
          'User-Agent': 'apiguard-nitrostack-hackathon'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (!response.ok) {
        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');
        const detail = (await response.text()).slice(0, 500);
        if (response.status === 403 && remaining === '0') {
          throw new Error(`GitHub rate limit exhausted; reset=${reset ?? 'unknown'}.`);
        }
        throw new Error(`GitHub API ${response.status}: ${detail}`);
      }
      return await response.json() as Record<string, any>;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
