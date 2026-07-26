import test from 'node:test';
import assert from 'node:assert/strict';
import { RiskService } from '../../src/modules/apiguard/risk.service.js';
import { ApiGuardConfig } from '../../src/modules/apiguard/config.service.js';

test('RiskService: gracefully falls back when LLM throws an error', async () => {
  const config = new ApiGuardConfig();
  config.useLlm = true;
  const service = new RiskService(config);

  // Mock callModel to simulate an API timeout or crash
  (service as any).callModel = async () => {
    throw new Error('Simulated API timeout');
  };

  const changes: any[] = [{ id: 'chg1', breaking: true, jsonPath: '$response.id' }];
  const evidence: any[] = [{
    id: 'ev1',
    repository: 'repo-A',
    filePath: 'src/main.ts',
    snippet: 'console.log(response.id)',
    relatedChangeIds: ['chg1']
  }];

  const result = await service.assess(changes, evidence);

  assert.equal(result.classifierMode, 'deterministic-fallback', 'Should fallback to deterministic mode');
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].classification, 'CONFIRMED_IMPACT', 'Fallback should identify simple matches');
  
  const hasLimitation = result.limitations.some(l => l.includes('Simulated API timeout'));
  assert.ok(hasLimitation, 'Limitations should contain the simulated error message');
});

test('RiskService: anti-hallucination logic strips invalid migration actions', async () => {
  const config = new ApiGuardConfig();
  config.useLlm = true;
  const service = new RiskService(config);

  // Mock callModel to return a hallucinated migration action for a non-existent file
  (service as any).callModel = async () => {
    return {
      assessments: [
        {
          evidenceId: 'ev1',
          classification: 'CONFIRMED_IMPACT',
          confidence: 'HIGH',
          reasoning: 'Clear usage of id field.',
          matchedChangeIds: ['chg1'],
          migrationActions: [
            {
              // Hallucinated file path
              repository: 'repo-A',
              filePath: 'src/hallucinated-file.ts',
              lineNumber: 42,
              title: 'Update ID type',
              description: 'Change to string',
              relatedChangeIds: ['chg1']
            },
            {
              // Valid action matching the evidence item
              repository: 'repo-A',
              filePath: 'src/main.ts',
              lineNumber: 10,
              title: 'Update ID type',
              description: 'Change to string',
              relatedChangeIds: ['chg1']
            }
          ]
        }
      ],
      limitations: []
    };
  };

  const changes: any[] = [{ id: 'chg1', breaking: true, jsonPath: '$response.id' }];
  const evidence: any[] = [{
    id: 'ev1',
    repository: 'repo-A',
    filePath: 'src/main.ts',
    snippet: 'console.log(response.id)',
    relatedChangeIds: ['chg1']
  }];

  const result = await service.assess(changes, evidence);
  
  assert.equal(result.classifierMode, 'llm');
  assert.equal(result.evidence[0].migrationActions.length, 1, 'Should strip the hallucinated action');
  assert.equal(result.evidence[0].migrationActions[0].filePath, 'src/main.ts', 'Should keep the valid action');
});
