import assert from 'node:assert/strict';
import test from 'node:test';
import type { Assessment } from '../../src/domain/types.js';
import { AssessmentService } from '../../src/modules/apiguard/assessment.service.js';

function assessment(status: Assessment['analysisStatus']): Assessment {
  const now = new Date().toISOString();
  return {
    id: 'asm-test', scenarioId: 'risky', analysisStatus: status, decisionStatus: 'PENDING',
    baselineSpecHash: 'b', candidateSpecHash: 'c', repositoryCommits: {}, sourceMode: 'snapshot',
    classifierMode: 'deterministic-fallback', repositoryScopeVersion: 1, changes: [], evidence: [],
    overallSeverity: 'MEDIUM', limitations: [], durationMs: 1, createdAt: now, updatedAt: now, version: 1
  };
}

test('only COMPLETE assessments may be approved', () => {
  for (const status of ['COMPLETE_WITH_WARNINGS', 'INCOMPLETE', 'FAILED'] as const) {
    let current = assessment(status);
    const repository = { get: () => current, update: (next: Assessment) => (current = next) };
    const service = new AssessmentService({} as any, {} as any, {} as any, {} as any, repository as any, {} as any);
    assert.throws(() => service.decide({
      assessmentId: current.id, expectedVersion: 1, decision: 'APPROVE', actorId: 'u', actorDisplayName: 'User', idempotencyKey: `approve-${status}`
    }), /Cannot APPROVE/);
  }
});
