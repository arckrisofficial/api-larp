import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiGuardConfig } from '../../src/modules/apiguard/config.service.js';
import { RepositoryScopeRepository } from '../../src/modules/apiguard/repository-scope.repository.js';
import { RepositoryScopeService } from '../../src/modules/apiguard/repository-scope.service.js';

test('RepositoryScopeRepository: empty state and upsert state changes', () => {
  const config = new ApiGuardConfig();
  const repo = new RepositoryScopeRepository(config);

  const initialScope = repo.getScope();
  assert.equal(typeof initialScope.version, 'number');

  const now = new Date().toISOString();
  const updatedScope = repo.upsert({
    id: '',
    owner: 'test-org',
    name: 'test-repo',
    branch: 'main',
    lastKnownCommitSha: 'sha123456789',
    status: 'ACTIVE',
    addedAt: now,
    addedBy: 'test-actor'
  });

  assert.equal(updatedScope.version, initialScope.version + 1);
  const active = repo.listActive();
  assert.ok(active.some((r) => r.owner === 'test-org' && r.name === 'test-repo'));
});

test('RepositoryScopeService: removes active repository idempotently', async () => {
  const config = new ApiGuardConfig();
  const repo = new RepositoryScopeRepository(config);
  const service = new RepositoryScopeService(config, repo);

  const now = new Date().toISOString();
  repo.upsert({
    id: '',
    owner: 'test-org',
    name: 'removable-repo',
    branch: 'main',
    lastKnownCommitSha: 'sha999',
    status: 'ACTIVE',
    addedAt: now,
    addedBy: 'test-actor'
  });

  const res1 = await service.applyRemove({
    owner: 'test-org',
    repository: 'removable-repo',
    reason: 'Declassifying for testing',
    actorId: 'test-actor'
  });

  assert.equal(res1.changed, true);
  assert.equal(res1.action, 'REMOVE');
  assert.equal(res1.repository.status, 'INACTIVE');
  assert.equal(res1.historicalEvidencePreserved, true);

  // Idempotent second removal
  const res2 = await service.applyRemove({
    owner: 'test-org',
    repository: 'removable-repo',
    reason: 'Declassifying again',
    actorId: 'test-actor'
  });

  assert.equal(res2.changed, false);
  assert.equal(res2.action, 'REMOVE');
});
