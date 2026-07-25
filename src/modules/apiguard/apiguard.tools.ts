import { ExecutionContext, Injectable, ToolDecorator as Tool, Widget, z } from '@nitrostack/core';
import { sha256 } from '../../domain/hash.js';
import { ApiGuardConfig } from './config.service.js';
import { AssessmentService } from './assessment.service.js';
import { ContractService } from './contract.service.js';
import { DiffService } from './diff.service.js';
import { EvidenceService } from './evidence.service.js';
import { FixService } from './fix.service.js';
import { RiskService } from './risk.service.js';
import { SpecRepository } from './spec.repository.js';

const ContractPairInput = z.object({
  scenarioId: z.string().regex(/^[a-z0-9_-]+$/i).optional().default('risky')
    .describe('Fixture or registered contract-pair identifier.')
});

@Injectable({
  deps: [
    ApiGuardConfig,
    SpecRepository,
    ContractService,
    DiffService,
    EvidenceService,
    RiskService,
    AssessmentService,
    FixService
  ]
})
export class ApiGuardTools {
  constructor(
    private readonly config: ApiGuardConfig,
    private readonly specs: SpecRepository,
    private readonly contractService: ContractService,
    private readonly diffService: DiffService,
    private readonly evidenceService: EvidenceService,
    private readonly riskService: RiskService,
    private readonly assessmentService: AssessmentService,
    private readonly fixService: FixService
  ) {}

  @Tool({
    name: 'register_api_contract_pair',
    description: 'Register baseline and candidate OpenAPI 3.0 JSON contracts from inline JSON objects or strings. Arbitrary URL fetching is intentionally not supported.',
    inputSchema: z.object({
      scenarioId: z.string().regex(/^[a-z0-9_-]+$/i).optional().describe('Optional stable contract-pair identifier.'),
      baselineSpec: z.union([z.record(z.unknown()), z.string()]).describe('Baseline OpenAPI 3.0 JSON object or JSON string.'),
      candidateSpec: z.union([z.record(z.unknown()), z.string()]).describe('Candidate OpenAPI 3.0 JSON object or JSON string.')
    }),
    invocation: { invoking: 'Registering OpenAPI contract pair…', invoked: 'OpenAPI contract pair registered' },
    examples: {
      request: {
        scenarioId: 'custom_user_v2',
        baselineSpec: { openapi: '3.0.3', info: { title: 'User API', version: '1.0' }, paths: {} },
        candidateSpec: { openapi: '3.0.3', info: { title: 'User API', version: '2.0' }, paths: {} }
      },
      response: { scenarioId: 'custom_user_v2', sourceType: 'INLINE' }
    }
  })
  async registerContractPair(
    input: {
      scenarioId?: string;
      baselineSpec: Record<string, unknown> | string;
      candidateSpec: Record<string, unknown> | string;
    },
    ctx: ExecutionContext
  ) {
    const result = await this.contractService.register(input);
    ctx.logger.info('Contract pair registered', { scenarioId: result.scenarioId });
    return result;
  }

  @Tool({
    name: 'diff_api_spec',
    description: 'Deterministically compare baseline and candidate OpenAPI 3.0 contracts using local-ref resolution and typed compatibility rules.',
    inputSchema: ContractPairInput,
    invocation: { invoking: 'Comparing API contracts…', invoked: 'API contract comparison complete' },
    examples: { request: { scenarioId: 'risky' }, response: { summary: { totalChanges: 4, breakingChanges: 3 } } }
  })
  async diffApiSpec(input: { scenarioId?: string }, ctx: ExecutionContext) {
    const { scenarioId } = ContractPairInput.parse(input ?? {});
    const scenario = await this.specs.getScenario(scenarioId);
    const changes = this.diffService.diff(scenario);
    const unsupportedChanges = changes.filter((change) => change.code === 'UNSUPPORTED_CHANGE').length;
    const output = {
      scenarioId,
      baselineSpecHash: sha256(scenario.baseline),
      candidateSpecHash: sha256(scenario.candidate),
      diffHash: sha256(changes),
      validation: {
        openApiVersion: String(scenario.candidate.openapi ?? ''),
        warnings: unsupportedChanges > 0 ? [`${unsupportedChanges} unsupported constructs require manual review.`] : []
      },
      summary: {
        totalChanges: changes.length,
        breakingChanges: changes.filter((change) => change.breaking).length,
        nonBreakingChanges: changes.filter((change) => !change.breaking && change.code !== 'UNSUPPORTED_CHANGE').length,
        unsupportedChanges
      },
      changes
    };
    ctx.logger.info('OpenAPI diff completed', { scenarioId, changeCount: changes.length });
    return output;
  }

  @Tool({
    name: 'collect_consumer_evidence',
    description: 'Collect provenance-tagged consumer-code evidence for deterministic contract changes from the configured snapshot or live GitHub scope.',
    inputSchema: z.object({
      scenarioId: z.string().regex(/^[a-z0-9_-]+$/i).optional().default('risky'),
      changeIds: z.array(z.string()).optional().describe('Optional subset of deterministic change IDs.'),
      forceRefresh: z.boolean().optional().default(false).describe('Bypass the short live GitHub cache. Ignored in snapshot mode.')
    }),
    invocation: { invoking: 'Collecting consumer evidence…', invoked: 'Consumer evidence snapshot ready' },
    examples: { request: { scenarioId: 'risky' }, response: { sourceMode: 'snapshot', evidenceCount: 5 } }
  })
  async collectConsumerEvidence(
    input: { scenarioId?: string; changeIds?: string[]; forceRefresh?: boolean },
    ctx: ExecutionContext
  ) {
    const scenarioId = input.scenarioId ?? 'risky';
    const scenario = await this.specs.getScenario(scenarioId);
    let changes = this.diffService.diff(scenario);
    if (input.changeIds?.length) {
      const requested = new Set(input.changeIds);
      changes = changes.filter((change) => requested.has(change.id));
      if (!changes.length) throw new Error('None of the requested change IDs belong to this contract pair.');
    }
    const pair = await this.evidenceService.collect(
      scenarioId,
      changes,
      sha256(scenario.baseline),
      sha256(scenario.candidate),
      input.forceRefresh ?? false
    );
    const snapshot = pair.snapshot;
    ctx.logger.info('Consumer evidence collected', {
      scenarioId,
      snapshotId: snapshot.snapshotId,
      evidenceCount: snapshot.results.length,
      sourceMode: snapshot.origin
    });
    return {
      scenarioId,
      snapshotId: snapshot.snapshotId,
      sourceMode: snapshot.origin === 'GITHUB' ? 'live' : 'snapshot',
      capturedAt: snapshot.generatedAt,
      repositoryCommits: Object.fromEntries(snapshot.repositoriesExpected.map((repo) => [`${repo.owner}/${repo.name}`, repo.commitSha])),
      repositoriesChecked: snapshot.repositoriesChecked,
      repositoriesFailed: snapshot.repositoriesFailed,
      evidenceCount: snapshot.results.length,
      limitations: pair.result.limitations,
      evidence: this.evidenceService.toEvidenceItems(snapshot),
      resourceUri: `apiguard://evidence-snapshots/${snapshot.snapshotId}`
    };
  }

  @Tool({
    name: 'assess_consumer_risk',
    description: 'Apply deterministic evidence filters and one bounded, schema-validated model call to ambiguous production-code evidence.',
    inputSchema: z.object({
      scenarioId: z.string().regex(/^[a-z0-9_-]+$/i).optional().default('risky'),
      snapshotId: z.string().optional().describe('Evidence snapshot to classify. A snapshot is collected when omitted.')
    }),
    invocation: { invoking: 'Assessing consumer impact…', invoked: 'Consumer impact assessed' },
    examples: { request: { scenarioId: 'risky' }, response: { overallSeverity: 'HIGH', classifierMode: 'deterministic-fallback' } }
  })
  async assessConsumerRisk(input: { scenarioId?: string; snapshotId?: string }, ctx: ExecutionContext) {
    const scenarioId = input.scenarioId ?? 'risky';
    const scenario = await this.specs.getScenario(scenarioId);
    const changes = this.diffService.diff(scenario);
    let snapshot = input.snapshotId ? this.evidenceService.getSnapshot(input.snapshotId) : undefined;
    if (!snapshot) {
      snapshot = (await this.evidenceService.collect(
        scenarioId,
        changes,
        sha256(scenario.baseline),
        sha256(scenario.candidate)
      )).snapshot;
    }
    this.evidenceService.assertSnapshotCompatible(snapshot, {
      scenarioId,
      baselineSpecHash: sha256(scenario.baseline),
      candidateSpecHash: sha256(scenario.candidate),
      validChangeIds: changes.map((change) => change.id)
    });
    const risk = await this.riskService.assess(changes, this.evidenceService.toEvidenceItems(snapshot));
    ctx.logger.info('Consumer risk assessed', { severity: risk.severity, classifierMode: risk.classifierMode });
    return {
      riskRunId: `risk_${sha256([snapshot.snapshotId, risk.evidence]).slice(0, 12)}`,
      scenarioId,
      snapshotId: snapshot.snapshotId,
      classifierMode: risk.classifierMode,
      modelProvider: risk.modelProvider,
      modelName: risk.modelName,
      overallSeverity: risk.severity,
      limitations: [...(snapshot.limitations ?? []), ...risk.limitations],
      evidence: risk.evidence
    };
  }

  @Tool({
    name: 'run_impact_assessment',
    description: 'Run the complete deterministic-plus-reasoning APIGuard workflow and persist a versioned release-impact assessment.',
    inputSchema: z.object({
      scenarioId: z.string().regex(/^[a-z0-9_-]+$/i).optional().default('risky'),
      snapshotId: z.string().optional(),
      forceRefresh: z.boolean().optional().default(false)
    }),
    invocation: { invoking: 'Building the API release evidence package…', invoked: 'API release evidence package ready' },
    examples: { request: { scenarioId: 'risky' }, response: { analysisStatus: 'COMPLETE', overallSeverity: 'HIGH' } }
  })
  @Widget('api-impact-summary')
  async runImpactAssessment(input: { scenarioId?: string; snapshotId?: string; forceRefresh?: boolean }, ctx: ExecutionContext) {
    const assessment = await this.assessmentService.run({
      scenarioId: input.scenarioId ?? 'risky',
      snapshotId: input.snapshotId,
      forceRefresh: input.forceRefresh
    });
    ctx.logger.info('Impact assessment completed', {
      assessmentId: assessment.id,
      durationMs: assessment.durationMs,
      severity: assessment.overallSeverity,
      status: assessment.analysisStatus
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
      idempotencyKey: z.string().min(8).max(160)
    }),
    invocation: { invoking: 'Recording release decision…', invoked: 'Release decision recorded' },
    examples: {
      request: { assessmentId: 'asm_preview', expectedVersion: 1, decision: 'BLOCK', reason: 'Consumers use the old contract.', idempotencyKey: 'block_asm_preview' },
      response: { decisionStatus: 'BLOCKED_PENDING_MIGRATION', version: 2 }
    }
  })
  @Widget('api-impact-summary')
  async recordReleaseDecision(
    input: {
      assessmentId: string;
      expectedVersion: number;
      decision: 'APPROVE' | 'BLOCK';
      reason?: string;
      idempotencyKey: string;
    },
    ctx: ExecutionContext
  ) {
    const actorId = (ctx as any).auth?.subject ?? this.config.actorId;
    const actorDisplayName = (ctx as any).auth?.displayName ?? this.config.actorDisplayName;
    const assessment = this.assessmentService.decide({ ...input, actorId, actorDisplayName });
    ctx.logger.info('Release decision recorded', {
      assessmentId: assessment.id,
      decisionStatus: assessment.decisionStatus,
      version: assessment.version,
      actorId
    });
    return assessment;
  }

  @Tool({
    name: 'propose_consumer_fixes',
    description: 'Generate a reviewable, versioned consumer migration plan after a human has blocked the release for migration. This tool never writes to GitHub.',
    inputSchema: z.object({
      assessmentId: z.string().min(1).describe('Completed APIGuard assessment identifier.')
    }),
    invocation: { invoking: 'Drafting consumer migration code…', invoked: 'Consumer fix plan ready for review' },
    examples: { request: { assessmentId: 'asm_preview' }, response: { status: 'DRAFT', files: 3 } }
  })
  async proposeConsumerFixes(input: { assessmentId: string }, ctx: ExecutionContext) {
    const plan = await this.fixService.propose(input.assessmentId);
    ctx.logger.info('Consumer fix plan generated', { fixPlanId: plan.id, files: plan.files.length, mode: plan.providerMode });
    return {
      ...plan,
      resourceUri: `apiguard://fix-plans/${plan.id}`,
      nextAction: 'Review every proposed file, then explicitly call create_migration_pull_requests.'
    };
  }

  @Tool({
    name: 'create_migration_pull_requests',
    description: 'After explicit confirmation, create draft GitHub pull requests for a reviewed fix plan. Never merges pull requests or writes to the default branch.',
    inputSchema: z.object({
      fixPlanId: z.string().min(1),
      confirmed: z.literal(true).describe('Explicit confirmation that the reviewed fix plan may be written to allow-listed repositories.')
    }),
    invocation: { invoking: 'Creating draft migration pull requests…', invoked: 'Migration pull request operation complete' },
    examples: { request: { fixPlanId: 'fix_preview', confirmed: true }, response: { status: 'PUBLISHED', createdPullRequests: [] } }
  })
  async createMigrationPullRequests(input: { fixPlanId: string; confirmed: true }, ctx: ExecutionContext) {
    const plan = await this.fixService.publishPullRequests(input.fixPlanId);
    ctx.logger.info('Migration pull request operation completed', {
      fixPlanId: plan.id,
      status: plan.status,
      pullRequests: plan.createdPullRequests.length
    });
    return plan;
  }
}
