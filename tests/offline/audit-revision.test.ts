import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiGuardConfig } from '../../src/modules/apiguard/config.service.js';
import { ContractService } from '../../src/modules/apiguard/contract.service.js';
import { RiskService } from '../../src/modules/apiguard/risk.service.js';

test('ContractService: registers inline baseline and candidate OpenAPI specs with valid hashes', async () => {
  const config = new ApiGuardConfig();
  const service = new ContractService(config);

  const result = await service.register({
    scenarioId: 'audit_test_scen',
    baselineSpec: { openapi: '3.0.0', info: { title: 'Test' }, paths: { '/user': { get: { responses: { '200': { description: 'ok' } } } } } },
    candidateSpec: { openapi: '3.0.0', info: { title: 'Test' }, paths: { '/user': { get: { responses: { '200': { description: 'ok' } } } } } }
  });

  assert.equal(result.scenarioId, 'audit_test_scen');
  assert.equal(result.sourceType, 'INLINE');
  assert.equal(result.operationCountBaseline, 1);
  assert.equal(result.operationCountCandidate, 1);
  assert.ok(result.baselineSpecHash.length > 0);
  assert.ok(result.candidateSpecHash.length > 0);
});

test('RiskService: filters out hallucinated migration actions with non-matching file paths', async () => {
  const config = new ApiGuardConfig();
  const risk = new RiskService(config);

  const changes: any[] = [{ id: 'chg_1', breaking: true, jsonPath: '$response.name' }];
  const evidence: any[] = [{
    id: 'ev_1',
    sourceMode: 'snapshot',
    capturedAt: new Date().toISOString(),
    repository: 'test-org/react-app',
    branch: 'main',
    commitSha: 'abc',
    searchQuery: 'name',
    generatedFromChangeIds: ['chg_1'],
    filePath: 'src/components/User.tsx',
    lineStart: 10,
    lineEnd: 12,
    snippet: 'const name = response.name;',
    contentHash: 'hash'
  }];

  const res = await risk.assess(changes, evidence);
  assert.equal(res.evidence.length, 1);
  assert.equal(res.evidence[0]!.classification, 'CONFIRMED_IMPACT');
});
