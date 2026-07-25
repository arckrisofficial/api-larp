import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../../src/domain/hash.js';
import type { FixPlan } from '../../src/domain/fix-plan.js';
import type { Assessment, AssessedEvidence } from '../../src/domain/types.js';
import { ApiGuardConfig } from '../../src/modules/apiguard/config.service.js';
import { FixService } from '../../src/modules/apiguard/fix.service.js';

function impactedEvidence(overrides: Partial<AssessedEvidence> = {}): AssessedEvidence {
  return {
    id: 'ev-react', sourceMode: 'snapshot', capturedAt: '2026-07-25T00:00:00.000Z',
    repository: 'bundled-fixtures/react-consumer', branch: 'main', commitSha: 'fixture-react-main',
    searchQuery: 'response.name', generatedFromChangeIds: ['change-name'],
    filePath: 'src/api/userProfile.ts', lineStart: 1, lineEnd: 5,
    snippet: 'const displayName = response.name;', contentHash: 'snippet-hash',
    classification: 'CONFIRMED_IMPACT', confidence: 'HIGH', matchedChangeIds: ['change-name'],
    reasoning: 'Executable production code reads a removed response field.', migrationActions: [],
    ...overrides
  };
}

function completeAssessment(): Assessment {
  const now = new Date().toISOString();
  return {
    id: 'asm-fix', scenarioId: 'risky', analysisStatus: 'COMPLETE', decisionStatus: 'BLOCKED_PENDING_MIGRATION',
    baselineSpecHash: 'base', candidateSpecHash: 'candidate', repositoryCommits: {}, sourceMode: 'snapshot',
    classifierMode: 'deterministic-only', repositoryScopeVersion: 1,
    changes: [{
      id: 'change-name', code: 'REQUIRED_PROPERTY_REMOVED', breaking: true, operation: 'GET /api/user',
      location: 'response', jsonPath: '$response.name', rationale: 'Required response property removed.',
      sourcePointers: {}
    }],
    evidence: [impactedEvidence()], overallSeverity: 'HIGH', limitations: [], durationMs: 1,
    createdAt: now, updatedAt: now, version: 2,
    decision: {
      decision: 'BLOCKED_PENDING_MIGRATION', reason: 'Consumers require migration.', actorId: 'dev',
      actorDisplayName: 'Developer', decidedAt: now, idempotencyKey: 'block-asm-fix'
    }
  };
}

class MemoryPlans {
  value?: FixPlan;
  save(plan: FixPlan): FixPlan { this.value = structuredClone(plan); return structuredClone(plan); }
  get(id: string): FixPlan | undefined { return this.value?.id === id ? structuredClone(this.value) : undefined; }
}

test('FixService creates a reviewable fixture migration plan without writing to GitHub', async () => {
  const original = { ...process.env };
  try {
    process.env.USE_LLM = 'false';
    const config = new ApiGuardConfig();
    const plans = new MemoryPlans();
    const service = new FixService(
      config,
      { get: () => completeAssessment() } as any,
      plans as any,
      { getFile: async () => { throw new Error('GitHub should not be called for bundled fixtures.'); } } as any,
      {} as any
    );
    const plan = await service.propose('asm-fix');
    assert.equal(plan.status, 'DRAFT');
    assert.equal(plan.providerMode, 'deterministic-fixture');
    assert.equal(plan.files.length, 1);
    assert.match(plan.files[0]!.proposedContent, /response\.fullName/);
    assert.equal(plan.createdPullRequests.length, 0);
  } finally {
    process.env = original;
  }
});

test('FixService requires an explicit blocked release decision before generating code changes', async () => {
  const original = { ...process.env };
  try {
    process.env.USE_LLM = 'false';
    const pending = { ...completeAssessment(), decisionStatus: 'PENDING' as const, decision: undefined, version: 1 };
    const service = new FixService(
      new ApiGuardConfig(),
      { get: () => pending } as any,
      new MemoryPlans() as any,
      {} as any,
      {} as any
    );
    await assert.rejects(service.propose(pending.id), /must be BLOCKED_PENDING_MIGRATION/);
  } finally {
    process.env = original;
  }
});

test('FixService reconciles model output to approved files and discards duplicate replacements', async () => {
  const original = { ...process.env };
  try {
    process.env.USE_LLM = 'true';
    process.env.FIX_MAX_FILE_CHARS = '24000';
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile('demo-repositories/react-consumer/src/api/userProfile.ts', 'utf8')
    );
    const proposed = source.replace(/response\.name/g, 'response.fullName');
    const model = {
      generateStructured: async () => ({
        provider: 'openai', model: 'test-model', output: {
          files: [
            {
              repository: 'bundled-fixtures/react-consumer', filePath: 'src/api/userProfile.ts', proposedContent: proposed,
              summary: 'Use the candidate response field.', relatedEvidenceIds: ['ev-react'], relatedChangeIds: ['change-name']
            },
            {
              repository: 'bundled-fixtures/react-consumer', filePath: 'src/api/userProfile.ts', proposedContent: `${proposed}\n`,
              summary: 'Duplicate replacement.', relatedEvidenceIds: ['ev-react'], relatedChangeIds: ['change-name']
            }
          ],
          limitations: []
        }
      })
    };
    const plan = await new FixService(
      new ApiGuardConfig(),
      { get: () => completeAssessment() } as any,
      new MemoryPlans() as any,
      {} as any,
      model as any
    ).propose('asm-fix');
    assert.equal(plan.files.length, 1);
    assert.match(plan.limitations.join(' '), /Duplicate model output/);
  } finally {
    process.env = original;
  }
});

test('FixService creates only draft pull requests on allow-listed repositories and is idempotent', async () => {
  const original = { ...process.env };
  try {
    process.env.APIGUARD_GITHUB_WRITE_ENABLED = 'true';
    process.env.APIGUARD_WRITABLE_REPOSITORIES = 'acme/react-consumer';
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.FIX_PR_DRAFT = 'true';
    const config = new ApiGuardConfig();
    const plans = new MemoryPlans();
    const originalContent = 'export const id: number = 1;\n';
    plans.value = {
      id: 'fix-pr', assessmentId: 'asm-pr', assessmentVersion: 2, status: 'DRAFT',
      providerMode: 'llm', modelProvider: 'openai', modelName: 'test-model', limitations: [],
      files: [{
        repository: 'acme/react-consumer', branch: 'main', baseCommitSha: 'base123',
        filePath: 'src/user.ts', originalContentHash: sha256(originalContent),
        proposedContent: 'export const id: string = "1";\n', summary: 'Migrate user ID to string.',
        relatedEvidenceIds: ['ev1'], relatedChangeIds: ['c1']
      }],
      createdPullRequests: [], createdAt: '2026-07-25T00:00:00.000Z', updatedAt: '2026-07-25T00:00:00.000Z', version: 1
    };
    const calls: string[] = [];
    const github = {
      getRepository: async () => ({ defaultBranch: 'main', private: false }),
      getBranchHead: async (_o: string, _r: string, branch: string) => branch === 'main' ? 'base123' : 'base123',
      createBranch: async () => { calls.push('createBranch'); },
      getFile: async () => ({ path: 'src/user.ts', sha: 'blob123', content: originalContent }),
      updateFile: async (_o: string, _r: string, input: any) => { calls.push(`update:${input.branch}`); return 'commit456'; },
      createPullRequest: async (_o: string, _r: string, input: any) => {
        calls.push(`pr:draft=${String(input.draft)}`);
        return { number: 7, htmlUrl: 'https://github.com/acme/react-consumer/pull/7' };
      }
    };
    const service = new FixService(config, {
      get: () => ({ ...completeAssessment(), id: 'asm-pr', version: 2 })
    } as any, plans as any, github as any, {} as any);
    const published = await service.publishPullRequests('fix-pr');
    assert.equal(published.status, 'PUBLISHED');
    assert.equal(published.createdPullRequests[0]!.draft, true);
    assert.deepEqual(calls, ['createBranch', 'update:apiguard/fix-pr', 'pr:draft=true']);

    const again = await service.publishPullRequests('fix-pr');
    assert.equal(again.createdPullRequests.length, 1);
    assert.equal(calls.length, 3);
  } finally {
    process.env = original;
  }
});

test('FixService refuses GitHub writes for repositories outside the explicit allow-list', async () => {
  const original = { ...process.env };
  try {
    process.env.APIGUARD_GITHUB_WRITE_ENABLED = 'true';
    process.env.APIGUARD_WRITABLE_REPOSITORIES = 'acme/other';
    process.env.GITHUB_TOKEN = 'test-token';
    const config = new ApiGuardConfig();
    const plans = new MemoryPlans();
    const content = 'old';
    plans.value = {
      id: 'fix-denied', assessmentId: 'asm', assessmentVersion: 2, status: 'DRAFT', providerMode: 'llm',
      files: [{ repository: 'acme/react-consumer', branch: 'main', baseCommitSha: 'base', filePath: 'x.ts',
        originalContentHash: sha256(content), proposedContent: 'new', summary: 'change', relatedEvidenceIds: ['e'], relatedChangeIds: ['c'] }],
      limitations: [], createdPullRequests: [], createdAt: '', updatedAt: '', version: 1
    };
    const service = new FixService(config, {
      get: () => ({ ...completeAssessment(), id: 'asm', version: 2 })
    } as any, plans as any, {} as any, {} as any);
    const result = await service.publishPullRequests('fix-denied');
    assert.equal(result.status, 'FAILED');
    assert.match(result.limitations.join(' '), /not in APIGUARD_WRITABLE_REPOSITORIES/);
  } finally {
    process.env = original;
  }
});

test('FixService refuses publishing a stale fix plan after the assessment version changes', async () => {
  const original = { ...process.env };
  try {
    process.env.APIGUARD_GITHUB_WRITE_ENABLED = 'true';
    process.env.APIGUARD_WRITABLE_REPOSITORIES = 'acme/react-consumer';
    process.env.GITHUB_TOKEN = 'test-token';
    const plans = new MemoryPlans();
    plans.value = {
      id: 'fix-stale', assessmentId: 'asm-stale', assessmentVersion: 2, status: 'DRAFT', providerMode: 'llm',
      files: [], limitations: [], createdPullRequests: [], createdAt: '', updatedAt: '', version: 1
    };
    const service = new FixService(
      new ApiGuardConfig(),
      { get: () => ({ ...completeAssessment(), id: 'asm-stale', version: 3 }) } as any,
      plans as any,
      {} as any,
      {} as any
    );
    await assert.rejects(service.publishPullRequests('fix-stale'), /current version is 3/);
  } finally {
    process.env = original;
  }
});
