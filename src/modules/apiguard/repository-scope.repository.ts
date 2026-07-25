import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Injectable } from '@nitrostack/core';
import type { ManagedRepository, RepositoryScope } from '../../domain/repository-scope.js';
import { ApiGuardConfig } from './config.service.js';

function repoId(owner: string, name: string): string {
  return createHash('sha256').update(`${owner}/${name}`).digest('hex').slice(0, 12);
}

const EMPTY_SCOPE: RepositoryScope = { version: 0, updatedAt: new Date(0).toISOString(), repositories: [] };

@Injectable({ deps: [ApiGuardConfig] })
export class RepositoryScopeRepository {
  private readonly filePath: string;
  private scope: RepositoryScope;

  constructor(private readonly config: ApiGuardConfig) {
    this.filePath = resolve(config.scopeFilePath);
    this.scope = this.load();
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  getScope(): RepositoryScope {
    return structuredClone(this.scope);
  }

  listActive(): ManagedRepository[] {
    return this.scope.repositories.filter((r) => r.status === 'ACTIVE');
  }

  find(owner: string, name: string): ManagedRepository | undefined {
    const id = repoId(owner, name);
    return this.scope.repositories.find((r) => r.id === id);
  }

  isEmpty(): boolean {
    return this.scope.repositories.length === 0;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  upsert(repo: ManagedRepository): RepositoryScope {
    const id = repoId(repo.owner, repo.name);
    const normalised: ManagedRepository = { ...repo, id };
    const idx = this.scope.repositories.findIndex((r) => r.id === id);
    if (idx >= 0) {
      this.scope.repositories[idx] = normalised;
    } else {
      this.scope.repositories.push(normalised);
    }
    this.scope.version += 1;
    this.scope.updatedAt = new Date().toISOString();
    this.persist();
    return structuredClone(this.scope);
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private load(): RepositoryScope {
    try {
      if (!existsSync(this.filePath)) return structuredClone(EMPTY_SCOPE);
      const raw = readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw) as RepositoryScope;
    } catch {
      return structuredClone(EMPTY_SCOPE);
    }
  }

  private persist(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.scope, null, 2), 'utf8');
      renameSync(tmp, this.filePath);
    } catch (err) {
      // Non-fatal: log but do not crash the server on persist error
      console.error('[RepositoryScopeRepository] Failed to persist scope:', err);
    }
  }
}

export { repoId };
