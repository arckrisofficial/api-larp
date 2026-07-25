import { ExecutionContext, Injectable, ToolDecorator as Tool, Widget, z } from '@nitrostack/core';
import { sha256 } from '../../domain/hash.js';
import { ApiGuardConfig } from './config.service.js';
import { AssessmentService } from './assessment.service.js';
import { DiffService } from './diff.service.js';
import { EvidenceService } from './evidence.service.js';
import { RiskService } from './risk.service.js';
import { RepositoryScopeService } from './repository-scope.service.js';
import { SpecRepository } from './spec.repository.js';

const ScenarioInput = z.object({
  scenarioId: z.string().regex(/^[a-z0-9_-]+$/i).default('risky').describe('Fixture scenario identifier.')
});

const WIDGET_EXAMPLE = {
  id: 'asm_preview',
  scenarioId: 'risky',
  analysisStatus: 'COMPLETE',
  decisionStatus: 'PENDING',
  baselineSpecHash: 'baseline-preview-hash',
  candidateSpecHash: 'candidate-preview-hash',
  repositoryCommits: { 'api-larp-demo/react-consumer': 'a1b2c3d4e5f6' },
  sourceMode: 'snapshot',
  classifierMode: 'deterministic-fallback',
  overallSeverity: 'HIGH',
  durationMs: 742,
  createdAt: '2026-07-25T08:30:00.000Z',
  updatedAt: '2026-07-25T08:30:00.000Z',
  version: 1,
  changes: [{
    id: 'chg_preview', code: 'REQUIRED_PROPERTY_REMOVED', breaking: true,
    operation: 'GET /api/user', location: 'response', jsonPath: '$response.name',
    rationale: 'Required property name was removed.', sourcePointers: {}
  }],
  evidence: [{
    id: 'ev_preview', sourceMode: 'snapshot', capturedAt: '2026-07-25T08:30:00.000Z',
    repository: 'api-larp-demo/react-consumer', branch: 'main', commitSha: 'a1b2c3d4e5f6',
    searchQuery: 'name', generatedFromChangeIds: ['chg_preview'], filePath: 'src/api/userProfile.ts',
    lineStart: 12, lineEnd: 13, snippet: 'const displayName = response.name;', contentHash: 'preview',
    classification: 'CONFIRMED_IMPACT', confidence: 'HIGH', matchedChangeIds: ['chg_preview'],
    reasoning: 'The production consumer reads the removed response.name field.', migrationActions: []
  }],
  limitations: ['Preview data uses a pinned repository snapshot.']
};

@Injectable({
  deps: [
    ApiGuardConfig,
    SpecRepository,
    DiffService,
    EvidenceService,
    RiskService,
    AssessmentService,
    RepositoryScopeService
  ]
})
export class ApiGuardTools {
  constructor(
    private readonly config: ApiGuardConfig,
    private readonly specs: SpecRepository,
    private readonly diffService: DiffService,
    private readonly evidenceService: EvidenceService,
    private readonly riskService: RiskService,
    private readonly assessmentService: AssessmentService,
    private readonly scopeService: RepositoryScopeService
  ) {}

  @Tool({
    name: 'diff_api_spec',
    description: 'Deterministically compare baseline and candidate OpenAPI 3.0 JSON specifications and return typed compatibility changes.',
    inputSchema: ScenarioInput,
    invocation: { invoking: 'Comparing API contracts…', invoked: 'API contract comparison complete' },
    examples: { request: { scenarioId: 'risky' }, response: { changes: [{ code: 'PROPERTY_TYPE_CHANGED', breaking: true }] } }
  })
  async diffApiSpec(input: { scenarioId?: string }, ctx: ExecutionContext) {
    const { scenarioId } = ScenarioInput.parse(input ?? {});
    const scenario = await this.specs.getScenario(scenarioId);
    const changes = this.diffService.diff(scenario);
    ctx.logger.info('OpenAPI diff completed', { scenarioId, changeCount: changes.length });
    return {
      scenarioId,
      baselineSpecHash: sha256(scenario.baseline),
      candidateSpecHash: sha256(scenario.candidate),
      supportedScope: 'OpenAPI 3.0 JSON with local component references',
      changes
    };
  }

  @Tool({
    name: 'discover_consumer_evidence',
    description: 'Collect provenance-tagged consumer-code evidence for deterministic contract changes from a snapshot or configured live GitHub scope.',
    inputSchema: ScenarioInput,
    invocation: { invoking: 'Collecting consumer evidence…', invoked: 'Consumer evidence collected' },
    examples: { request: { scenarioId: 'risky' }, response: { sourceMode: 'snapshot', evidenceCount: 4 } }
  })
  async discoverEvidence(input: { scenarioId?: string }, ctx: ExecutionContext) {
    const { scenarioId } = ScenarioInput.parse(input ?? {});
    const scenario = await this.specs.getScenario(scenarioId);
    const changes = this.diffService.diff(scenario);
    const result = await this.evidenceService.discover(scenarioId, changes);
    ctx.logger.info('Consumer evidence collected', { sourceMode: result.sourceMode, count: result.items.length });
    return {
      scenarioId,
      sourceMode: result.sourceMode,
      evidenceCount: result.items.length,
      limitations: result.limitations,
      evidence: result.items
    };
  }

  @Tool({
    name: 'assess_consumer_risk',
    description: 'Classify consumer evidence using deterministic filters and one bounded, schema-validated LLM call for ambiguous production code.',
    inputSchema: ScenarioInput,
    invocation: { invoking: 'Assessing consumer impact…', invoked: 'Consumer impact assessed' },
    examples: { request: { scenarioId: 'risky' }, response: { overallSeverity: 'HIGH', classifierMode: 'deterministic-fallback' } }
  })
  async assessRisk(input: { scenarioId?: string }, ctx: ExecutionContext) {
    const { scenarioId } = ScenarioInput.parse(input ?? {});
    const scenario = await this.specs.getScenario(scenarioId);
    const changes = this.diffService.diff(scenario);
    const evidence = await this.evidenceService.discover(scenarioId, changes);
    const risk = await this.riskService.assess(changes, evidence.items);
    ctx.logger.info('Consumer risk assessed', { severity: risk.severity, classifierMode: risk.classifierMode });
    return {
      scenarioId,
      sourceMode: evidence.sourceMode,
      classifierMode: risk.classifierMode,
      overallSeverity: risk.severity,
      limitations: [...evidence.limitations, ...risk.limitations],
      evidence: risk.evidence
    };
  }

  @Tool({
    name: 'run_impact_assessment',
    description: 'Run the complete reliable APIGuard workflow and persist a versioned release-impact assessment.',
    inputSchema: ScenarioInput,
    invocation: { invoking: 'Building the API release evidence package…', invoked: 'API release evidence package ready' },
    examples: { request: { scenarioId: 'risky' }, response: WIDGET_EXAMPLE }
  })
  @Widget('api-impact-summary')
  async runImpactAssessment(input: { scenarioId?: string }, ctx: ExecutionContext) {
    const { scenarioId } = ScenarioInput.parse(input ?? {});
    const assessment = await this.assessmentService.run(scenarioId);
    ctx.logger.info('Impact assessment completed', {
      assessmentId: assessment.id,
      durationMs: assessment.durationMs,
      severity: assessment.overallSeverity
    });
    return assessment;
  }

  @Tool({
    name: 'record_release_decision',
    description: 'Record an idempotent human approval or block decision against a completed versioned assessment.',
    inputSchema: z.object({
      assessmentId: z.string().min(1),
      expectedVersion: z.number().int().positive(),
      decision: z.enum(['APPROVE', 'BLOCK']),
      reason: z.string().max(500).optional(),
      idempotencyKey: z.string().min(8).max(160),
      actorId: z.string().min(1).optional(),
      actorDisplayName: z.string().min(1).optional()
    }),
    invocation: { invoking: 'Recording release decision…', invoked: 'Release decision recorded' },
    examples: {
      request: {
        assessmentId: 'asm_preview', expectedVersion: 1, decision: 'BLOCK',
        reason: 'Consumers still use the old contract.', idempotencyKey: 'asm_preview:block:v1'
      },
      response: { ...WIDGET_EXAMPLE, decisionStatus: 'BLOCKED_PENDING_MIGRATION', version: 2 }
    }
  })
  @Widget('api-impact-summary')
  async recordDecision(
    input: {
      assessmentId: string;
      expectedVersion: number;
      decision: 'APPROVE' | 'BLOCK';
      reason?: string;
      idempotencyKey: string;
      actorId?: string;
      actorDisplayName?: string;
    },
    ctx: ExecutionContext
  ) {
    const assessment = this.assessmentService.decide({
      ...input,
      actorId: input.actorId ?? this.config.actorId,
      actorDisplayName: input.actorDisplayName ?? this.config.actorDisplayName
    });
    ctx.logger.info('Release decision recorded', {
      assessmentId: assessment.id,
      decisionStatus: assessment.decisionStatus,
      version: assessment.version
    });
    return assessment;
  }
  @Tool({
    name: 'manage_repository_scope',
    description: 'Add or deactivate a GitHub repository in the consumer-impact assessment scope. Adding validates the repository against GitHub, resolves the default branch, and pins the latest commit SHA. Removing marks the repository INACTIVE without deleting historical evidence.',
    inputSchema: z.object({
      action: z.enum(['ADD', 'REMOVE']).describe('ADD makes the repository active in the scope. REMOVE deactivates it without deleting evidence.'),
      owner: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/).describe('GitHub repository owner (user or organisation).'),
      repository: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/).describe('GitHub repository name (without owner prefix).'),
      branch: z.string().min(1).max(200).optional().describe('Branch to pin. Defaults to the repository default branch.'),
      reason: z.string().min(5).max(500).describe('Why this repository is being added or removed.'),
      confirmed: z.literal(true).describe('Must be true. Confirms the operator intends to mutate the assessment scope.')
    }),
    invocation: { invoking: 'Updating repository assessment scope…', invoked: 'Repository assessment scope updated' },
    examples: {
      request: { action: 'ADD', owner: 'arckrisofficial', repository: 'api-larp', reason: 'This application consumes the User API.', confirmed: true },
      response: { changed: true, action: 'ADD', repository: { owner: 'arckrisofficial', name: 'api-larp', status: 'ACTIVE' }, snapshotStatus: 'STALE' }
    }
  })
  async manageRepositoryScope(
    input: {
      action: 'ADD' | 'REMOVE';
      owner: string;
      repository: string;
      branch?: string;
      reason: string;
      confirmed: true;
    },
    ctx: ExecutionContext
  ) {
    const actorId = this.config.actorId;
    const result = input.action === 'ADD'
      ? await this.scopeService.applyAdd({ owner: input.owner, repository: input.repository, branch: input.branch, reason: input.reason, actorId })
      : await this.scopeService.applyRemove({ owner: input.owner, repository: input.repository, reason: input.reason, actorId });
    ctx.logger.info('Repository scope updated', { action: input.action, repo: `${input.owner}/${input.repository}`, changed: result.changed });
    return result;
  }

  @Tool({
    name: 'refresh_repository_evidence',
    description: 'Fetch the latest commit SHA for all active repositories in the assessment scope and invalidate the evidence cache so the next run_impact_assessment uses current code.',
    inputSchema: z.object({
      repositories: z.array(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)).optional().describe('Optional subset of owner/name strings to refresh. Defaults to all active repositories.'),
      forceRefresh: z.boolean().default(false).describe('When true, clears the evidence cache before re-fetching.')
    }),
    invocation: { invoking: 'Refreshing repository commit SHAs…', invoked: 'Repository evidence refreshed' },
    examples: {
      request: { forceRefresh: false },
      response: { refreshed: 1, failed: [], scope: { version: 2 } }
    }
  })
  async refreshRepositoryEvidence(
    input: { repositories?: string[]; forceRefresh?: boolean },
    ctx: ExecutionContext
  ) {
    const result = await this.scopeService.refreshCommitShas(input.repositories);
    ctx.logger.info('Repository evidence refreshed', { refreshed: result.refreshed, failed: result.failed.length });
    return {
      ...result,
      nextAction: result.refreshed > 0
        ? 'Run run_impact_assessment to generate a fresh assessment using the updated commit SHAs.'
        : 'No repositories were refreshed. Check that there are active repositories in scope.'
    };
  }
}
