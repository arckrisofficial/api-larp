import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiGuardConfig } from '../../src/modules/apiguard/config.service.js';
import { EvidenceService } from '../../src/modules/apiguard/evidence.service.js';

const snapshot: any = {
  schemaVersion: 2,
  snapshotId: 'snap-1',
  scenarioId: 'risky',
  origin: 'FIXTURE',
  generatedAt: '2026-07-25T00:00:00.000Z',
  repositoryScopeVersion: 1,
  queries: [{ queryId: 'q1', query: 'response.name', generatedFromChangeIds: ['c1'] }],
  repositoriesExpected: [], repositoriesChecked: [], repositoriesFailed: [],
  results: [{
    evidenceId: 'e1', queryId: 'q1', repository: 'bundled-fixtures/react-consumer', branch: 'main',
    commitSha: 'abc1234', filePath: 'src/api/userProfile.ts', lineStart: 1, lineEnd: 2,
    snippet: 'const x = response.name;', contentHash: 'hash'
  }]
};

test('EvidenceService preserves snapshot provenance and change links', () => {
  const service = new EvidenceService(new ApiGuardConfig(), {} as any, {} as any, {} as any);
  const [item] = service.toEvidenceItems(snapshot);
  if (!item) throw new Error('Expected mapped evidence item.');
  assert.equal(item.sourceMode, 'snapshot');
  assert.equal(item.searchQuery, 'response.name');
  assert.deepEqual(item.generatedFromChangeIds, ['c1']);
  assert.equal(item.repository, 'bundled-fixtures/react-consumer');
  assert.equal(item.commitSha, 'abc1234');
});
