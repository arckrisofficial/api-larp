import { ExecutionContext, ToolDecorator as Tool, Widget, z, Injectable } from '@nitrostack/core';
import { sha256 } from '../../domain/hash.js';
import { ApiGuardConfig } from './config.service.js';
import { AssessmentService } from './assessment.service.js';
import { DiffService } from './diff.service.js';
import { EvidenceService } from './evidence.service.js';
import { RiskService } from './risk.service.js';
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

@Injectable({ deps: [ApiGuardConfig, SpecRepository, DiffService, EvidenceService, RiskService, AssessmentService] })
export class ApiGuardTools {
  constructor(
    private readonly config: ApiGuardConfig,
    private readonly specs: SpecRepository,
    private readonly diffService: DiffService,
    private readonly evidenceService: EvidenceService,
    private readonly riskService: RiskService,
    private readonly assessmentService: AssessmentService
  ) {}

  @Tool({
    name: 'diff_api_spec',
    description: 'Deterministically compare baseline and candidate OpenAPI 3.0 JSON specifications and return typed compatibility changes.',
    inputSchema: ScenarioInput,
    invocation: { invoking: 'Comparing API contracts…', invoked: 'API contract comparison complete' },
    examples: { request: { scenarioId: 'risky' }, response: { changes: [{ code: 'PROPERTY_TYPE_CHANGED', breaking: true }] } }
  })
  async diffApiSpec(input: { scenarioId?: string }, ctx: ExecutionContext) {
    const scenarioId = input?.scenarioId || this.config.demoScenario;
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
    const scenarioId = input?.scenarioId || this.config.demoScenario;
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
    const scenarioId = input?.scenarioId || this.config.demoScenario;
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
    const scenarioId = input?.scenarioId || this.config.demoScenario;
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
    name: 'list_scenarios',
    description: 'Lists all available fixture scenario identifiers.',
    inputSchema: z.object({}),
    invocation: { invoking: 'Listing scenarios…', invoked: 'Scenarios listed' },
    examples: { request: {}, response: { scenarios: ['risky'] } }
  })
  async listScenarios(_input: unknown, ctx: ExecutionContext) {
    const scenarios = await this.specs.listScenarios();
    ctx.logger.info('Listed scenarios', { count: scenarios.length });
    return { scenarios };
  }

  @Tool({
    name: 'get_api_spec',
    description: 'Retrieve the baseline or candidate OpenAPI JSON specification for a given scenario.',
    inputSchema: z.object({
      scenarioId: z.string().regex(/^[a-z0-9_-]+$/i).describe('Fixture scenario identifier.'),
      kind: z.enum(['baseline', 'candidate']).describe('Which specification to retrieve.')
    }),
    invocation: { invoking: 'Retrieving API spec…', invoked: 'API spec retrieved' },
    examples: { request: { scenarioId: 'risky', kind: 'baseline' }, response: { openapi: '3.0.0', info: { title: 'Example API' } } }
  })
  async getApiSpec(input: { scenarioId?: string, kind: 'baseline' | 'candidate' }, ctx: ExecutionContext) {
    const scenarioId = input?.scenarioId || this.config.demoScenario;
    const spec = await this.specs.getSpec(scenarioId, input.kind);
    ctx.logger.info('Retrieved API spec', { scenarioId, kind: input.kind });
    return spec;
  }

  @Tool({
    name: 'get_assessment',
    description: 'Retrieve an existing persisted release-impact assessment by its identifier.',
    inputSchema: z.object({
      assessmentId: z.string().min(1).describe('The assessment identifier (starts with asm_).')
    }),
    invocation: { invoking: 'Retrieving assessment…', invoked: 'Assessment retrieved' },
    examples: { request: { assessmentId: 'asm_preview' }, response: WIDGET_EXAMPLE }
  })
  async getAssessment(input: { assessmentId: string }, ctx: ExecutionContext) {
    const assessment = this.assessmentService.get(input.assessmentId);
    ctx.logger.info('Retrieved assessment', { assessmentId: input.assessmentId });
    return assessment;
  }
}
