import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiGuardConfig } from '../../src/modules/apiguard/config.service.js';
import { EvidenceService } from '../../src/modules/apiguard/evidence.service.js';
import { excerptFor } from '../../src/modules/apiguard/github-evidence.provider.js';
import { queriesForChanges } from '../../src/modules/apiguard/evidence.provider.js';
import { SnapshotEvidenceProvider } from '../../src/modules/apiguard/snapshot-evidence.provider.js';

function snapshot(overrides: Record<string, unknown> = {}): any {
  return {
    schemaVersion: 2,
    snapshotId: 'snap-consistency',
    scenarioId: 'risky',
    origin: 'GITHUB',
    baselineSpecHash: 'baseline-hash',
    candidateSpecHash: 'candidate-hash',
    repositoryScopeVersion: 1,
    queryPlanHash: 'query-hash',
    generatedAt: '2026-07-25T00:00:00.000Z',
    repositoriesExpected: [],
    repositoriesChecked: [],
    repositoriesFailed: [],
    queries: [{ queryId: 'q1', query: 'name', generatedFromChangeIds: ['c1'] }],
    results: [],
    ...overrides
  };
}

test('snapshot compatibility rejects stale contracts and obsolete change links', () => {
  const service = new EvidenceService(new ApiGuardConfig(), {} as any, {} as any, {} as any);
  assert.doesNotThrow(() => service.assertSnapshotCompatible(snapshot(), {
    scenarioId: 'risky', baselineSpecHash: 'baseline-hash', candidateSpecHash: 'candidate-hash', validChangeIds: ['c1']
  }));
  assert.throws(() => service.assertSnapshotCompatible(snapshot({ candidateSpecHash: 'old-candidate' }), {
    scenarioId: 'risky', baselineSpecHash: 'baseline-hash', candidateSpecHash: 'candidate-hash', validChangeIds: ['c1']
  }), /stale for the candidate/);
  assert.throws(() => service.assertSnapshotCompatible(snapshot(), {
    scenarioId: 'risky', baselineSpecHash: 'baseline-hash', candidateSpecHash: 'candidate-hash', validChangeIds: ['different-change']
  }), /no longer current/);
});

test('live evidence extraction never fabricates a snippet when the pinned source lacks the search term', () => {
  assert.equal(excerptFor('const value = payload.id;\n', 'fullName', 1200), undefined);
  const excerpt = excerptFor('const value = payload.id;\nconst name = payload.fullName;\n', 'fullName', 1200);
  assert.equal(excerpt?.lineStart, 1);
  assert.ok((excerpt?.lineEnd ?? 0) >= 2);
  assert.match(excerpt?.snippet ?? '', /fullName/);
});

test('evidence query planning covers removed operations by endpoint path', () => {
  const queries = queriesForChanges([{
    id: 'c-operation', code: 'OPERATION_REMOVED', breaking: true, operation: 'POST /api/users',
    location: 'operation', rationale: 'removed', sourcePointers: {}
  }]);
  assert.deepEqual(queries, [{ id: 'query__api_users', query: '/api/users', changeIds: ['c-operation'] }]);
});

test('a dynamically registered contract without a bundled snapshot degrades to an incomplete empty snapshot', async () => {
  const provider = new SnapshotEvidenceProvider(new ApiGuardConfig());
  const { result, snapshot: empty } = await provider.discoverSnapshot(
    'no_fixture_contract',
    [{ id: 'c1', code: 'REQUIRED_PROPERTY_REMOVED', breaking: true, operation: 'GET /u', location: 'response', jsonPath: '$response.name', rationale: 'removed', sourcePointers: {} }],
    'base-hash',
    'candidate-hash'
  );
  assert.equal(empty.results.length, 0);
  assert.equal(empty.baselineSpecHash, 'base-hash');
  assert.match(result.limitations.join(' '), /No bundled evidence snapshot/);
});
