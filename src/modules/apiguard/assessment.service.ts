import { randomUUID } from 'node:crypto';
import { Injectable } from '@nitrostack/core';
import { applyDecision, type DecisionRequest } from '../../domain/decision-state.js';
import { sha256 } from '../../domain/hash.js';
import type { Assessment } from '../../domain/types.js';
import { AssessmentRepository } from './assessment.repository.js';
import { DiffService } from './diff.service.js';
import { EvidenceService } from './evidence.service.js';
import { RiskService } from './risk.service.js';
import { SpecRepository } from './spec.repository.js';

@Injectable({ deps: [SpecRepository, DiffService, EvidenceService, RiskService, AssessmentRepository] })
export class AssessmentService {
  constructor(
    private readonly specs: SpecRepository,
    private readonly diffService: DiffService,
    private readonly evidenceService: EvidenceService,
    private readonly riskService: RiskService,
    private readonly repository: AssessmentRepository
  ) {}

  async run(scenarioId?: string): Promise<Assessment> {
    const started = Date.now();
    const scenario = await this.specs.getScenario(scenarioId);
    const targetScenarioId = scenario.scenarioId;
    const changes = this.diffService.diff(scenario);
    const discovered = await this.evidenceService.discover(targetScenarioId, changes);
    const risk = await this.riskService.assess(changes, discovered.items);
    const now = new Date().toISOString();
    const repositoryCommits = Object.fromEntries(discovered.items.map((item) => [item.repository, item.commitSha]));
    const hasReview = risk.evidence.some((item) => item.classification === 'REVIEW_REQUIRED');
    const assessment: Assessment = {
      id: `asm_${randomUUID()}`, scenarioId: targetScenarioId,
      analysisStatus: hasReview ? 'COMPLETE_WITH_WARNINGS' : 'COMPLETE', decisionStatus: 'PENDING',
      baselineSpecHash: sha256(scenario.baseline), candidateSpecHash: sha256(scenario.candidate), repositoryCommits,
      sourceMode: discovered.sourceMode, classifierMode: risk.classifierMode,
      changes, evidence: risk.evidence, overallSeverity: risk.severity,
      limitations: [...discovered.limitations, ...risk.limitations], durationMs: Date.now() - started,
      createdAt: now, updatedAt: now, version: 1
    };
    return this.repository.create(assessment);
  }

  get(id: string): Assessment { const assessment = this.repository.get(id); if (!assessment) throw new Error(`Assessment ${id} was not found.`); return assessment; }

  decide(request: DecisionRequest): Assessment {
    const current = this.get(request.assessmentId);
    return this.repository.update(applyDecision(current, request));
  }
}
