import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiGuardConfig } from '../../src/modules/apiguard/config.service.js';
import { RiskService } from '../../src/modules/apiguard/risk.service.js';

const evidence: any = {
  id: 'ev1', sourceMode: 'snapshot', capturedAt: '2026-07-25T00:00:00.000Z', repository: 'org/repo',
  branch: 'main', commitSha: 'abc', searchQuery: 'name', generatedFromChangeIds: ['real-change'],
  filePath: 'src/user.ts', lineStart: 1, lineEnd: 1, snippet: 'const x = response.name;', contentHash: 'h'
};
const changes: any[] = [{ id: 'real-change', breaking: true, jsonPath: '$response.name' }];

test('model impact claims with hallucinated change IDs are downgraded to manual review', async () => {
  const original = { ...process.env };
  try {
    process.env.USE_LLM = 'true';
    const model = {
      generateStructured: async () => ({
        provider: 'openai', model: 'test', output: {
          assessments: [{
            evidenceId: 'ev1', classification: 'CONFIRMED_IMPACT', confidence: 'HIGH',
            matchedChangeIds: ['hallucinated-change'], reasoning: 'Impact.', migrationActions: []
          }], limitations: []
        }
      })
    };
    const result = await new RiskService(new ApiGuardConfig(), model as any).assess(changes, [evidence]);
    assert.equal(result.evidence[0]!.classification, 'REVIEW_REQUIRED');
    assert.equal(result.classifierMode, 'hybrid-with-fallback');
    assert.equal(result.severity, 'MEDIUM');
  } finally {
    process.env = original;
  }
});

test('missing consumer evidence never turns breaking contract changes green', async () => {
  const result = await new RiskService(new ApiGuardConfig(), {} as any).assess(changes, []);
  assert.equal(result.severity, 'MEDIUM');
  assert.match(result.limitations.join(' '), /manual review/);
});
