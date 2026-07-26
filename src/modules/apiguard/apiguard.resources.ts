import { ExecutionContext, Injectable, ResourceDecorator as Resource } from '@nitrostack/core';
import { AssessmentService } from './assessment.service.js';
import { EvidenceService } from './evidence.service.js';
import { FixService } from './fix.service.js';
import { SpecRepository } from './spec.repository.js';

function jsonResource(_uri: string, data: unknown) {
  return JSON.stringify(data, null, 2);
}

@Injectable({ deps: [SpecRepository, AssessmentService, EvidenceService, FixService] })
export class ApiGuardResources {
  constructor(
    private readonly specs: SpecRepository,
    private readonly assessments: AssessmentService,
    private readonly evidenceService: EvidenceService,
    private readonly fixService: FixService
  ) {}

  @Resource({
    uri: 'apiguard://scenarios',
    name: 'APIGuard contract-pair catalogue',
    description: 'List bundled fixture and dynamically registered contract-pair identifiers.',
    mimeType: 'application/json'
  })
  async scenarios(uri: string, _ctx: ExecutionContext) {
    return jsonResource(uri, { scenarios: await this.specs.listScenarios() });
  }

  @Resource({ uri: 'apiguard://scenarios/{scenarioId}/specs/baseline', name: 'Baseline OpenAPI specification', description: 'The currently released OpenAPI contract.', mimeType: 'application/json' })
  async baseline(uri: string, _ctx: ExecutionContext) {
    const match = /^apiguard:\/\/scenarios\/([^/]+)\/specs\/baseline$/.exec(uri);
    if (!match?.[1]) throw new Error('Invalid baseline resource URI.');
    return jsonResource(uri, await this.specs.getSpec(match[1], 'baseline'));
  }

  @Resource({ uri: 'apiguard://scenarios/{scenarioId}/specs/candidate', name: 'Candidate OpenAPI specification', description: 'The proposed OpenAPI contract under review.', mimeType: 'application/json' })
  async candidate(uri: string, _ctx: ExecutionContext) {
    const match = /^apiguard:\/\/scenarios\/([^/]+)\/specs\/candidate$/.exec(uri);
    if (!match?.[1]) throw new Error('Invalid candidate resource URI.');
    return jsonResource(uri, await this.specs.getSpec(match[1], 'candidate'));
  }

  @Resource({ uri: 'apiguard://assessments/{assessmentId}', name: 'APIGuard assessment', description: 'Read the latest analysis and human decision state for an assessment.', mimeType: 'application/json' })
  assessment(uri: string, _ctx: ExecutionContext) {
    const match = /^apiguard:\/\/assessments\/(.+)$/.exec(uri);
    if (!match?.[1]) throw new Error('Invalid assessment resource URI.');
    return jsonResource(uri, this.assessments.get(match[1]));
  }

  @Resource({
    uri: 'apiguard://evidence-snapshots/{snapshotId}',
    name: 'Evidence snapshot',
    description: 'Read a versioned, provenance-tagged consumer-code evidence snapshot.',
    mimeType: 'application/json'
  })
  evidenceSnapshot(uri: string, _ctx: ExecutionContext) {
    const match = /^apiguard:\/\/evidence-snapshots\/(.+)$/.exec(uri);
    if (!match?.[1]) throw new Error('Invalid snapshot resource URI.');
    const snapshot = this.evidenceService.getSnapshot(match[1]);
    if (!snapshot) throw new Error(`Evidence snapshot ${match[1]} was not found.`);
    return jsonResource(uri, snapshot);
  }

  @Resource({
    uri: 'apiguard://fix-plans/{fixPlanId}',
    name: 'Consumer migration fix plan',
    description: 'Read proposed source changes and any draft pull requests created from them.',
    mimeType: 'application/json'
  })
  fixPlan(uri: string, _ctx: ExecutionContext) {
    const match = /^apiguard:\/\/fix-plans\/(.+)$/.exec(uri);
    if (!match?.[1]) throw new Error('Invalid fix-plan resource URI.');
    return jsonResource(uri, this.fixService.get(match[1]));
  }
}
