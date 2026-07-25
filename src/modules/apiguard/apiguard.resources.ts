import { ExecutionContext, ResourceDecorator as Resource, Injectable } from '@nitrostack/core';
import { AssessmentService } from './assessment.service.js';
import { SpecRepository } from './spec.repository.js';

function jsonResource(uri: string, data: unknown) {
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
}

@Injectable({ deps: [SpecRepository, AssessmentService] })
export class ApiGuardResources {
  constructor(private readonly specs: SpecRepository, private readonly assessments: AssessmentService) {}

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
  async assessment(uri: string, _ctx: ExecutionContext) {
    const match = /^apiguard:\/\/assessments\/(.+)$/.exec(uri);
    if (!match?.[1]) throw new Error('Invalid assessment resource URI.');
    return jsonResource(uri, this.assessments.get(match[1]));
  }
}
