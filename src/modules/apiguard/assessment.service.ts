import { randomUUID } from 'node:crypto';
import { Injectable } from '@nitrostack/core';
import { applyDecision, type DecisionRequest } from '../../domain/decision-state.js';
import { sha256 } from '../../domain/hash.js';
import type { AnalysisStatus, ApiChange, AssessedEvidence, Assessment } from '../../domain/types.js';
import { AssessmentRepository } from './assessment.repository.js';
import { DiffService } from './diff.service.js';
import { EvidenceService } from './evidence.service.js';
import { RepositoryScopeRepository } from './repository-scope.repository.js';
import { RiskService } from './risk.service.js';
import { SpecRepository } from './spec.repository.js';

export interface RunAssessmentOptions {
  scenarioId: string;
  snapshotId?: string;
  forceRefresh?: boolean;
}

@Injectable({
  deps: [
    SpecRepository,
    DiffService,
    EvidenceService,
    RiskService,
    AssessmentRepository,
    RepositoryScopeRepository
  ]
})
export class AssessmentService {
  constructor(
    private readonly specs: SpecRepository,
    private readonly diffService: DiffService,
    private readonly evidenceService: EvidenceService,
    private readonly riskService: RiskService,
    private readonly repository: AssessmentRepository,
    private readonly scopeRepository: RepositoryScopeRepository
  ) {}

  async run(options: string | RunAssessmentOptions): Promise<Assessment> {
    const opts: RunAssessmentOptions = typeof options === 'string' ? { scenarioId: options } : options;
    const started = Date.now();
    const scenario = await this.specs.getScenario(opts.scenarioId);
    const changes = this.diffService.diff(scenario);

    const baselineHash = sha256(scenario.baseline);
    const candidateHash = sha256(scenario.candidate);

    // Retrieve requested or latest evidence snapshot
    let snapshot = opts.snapshotId ? this.evidenceService.getSnapshot(opts.snapshotId) : undefined;
    if (!snapshot || opts.forceRefresh) {
      const pair = await this.evidenceService.discoverSnapshot(
        opts.scenarioId,
        changes,
        baselineHash,
        candidateHash,
        opts.forceRefresh
      );
      snapshot = pair.snapshot;
    }

    // Risk classification
    const risk = await this.riskService.assess(changes, snapshot.results.map(snapshotResultToEvidenceItem));
    const now = new Date().toISOString();

    const expectedRepos = snapshot.repositoriesExpected.map((r) => `${r.owner}/${r.name}`);
    const checkedRepos = snapshot.repositoriesChecked;
    const failedRepos = snapshot.repositoriesFailed.map((f) => f.repository);
    const coverageRatio = expectedRepos.length > 0 ? checkedRepos.length / expectedRepos.length : 0;

    const repositoryCommits = Object.fromEntries(
      snapshot.repositoriesExpected.map((r) => [`${r.owner}/${r.name}`, r.commitSha])
    );

    // Truthful completeness and severity logic
    const { status, severity, extraLimitations } = computeTruthfulStatusAndSeverity(
      changes,
      risk.evidence,
      checkedRepos.length,
      expectedRepos.length,
      failedRepos.length,
      risk.classifierMode
    );

    const assessment: Assessment = {
      id: `asm_${randomUUID()}`,
      scenarioId: opts.scenarioId,
      analysisStatus: status,
      decisionStatus: 'PENDING',
      baselineSpecHash: baselineHash,
      candidateSpecHash: candidateHash,
      repositoryCommits,
      sourceMode: snapshot.origin === 'GITHUB' ? 'live' : 'snapshot',
      classifierMode: risk.classifierMode,
      repositoryScopeVersion: snapshot.repositoryScopeVersion,
      evidenceSnapshotId: snapshot.snapshotId,
      repositoriesExpected: expectedRepos,
      repositoriesChecked: checkedRepos,
      repositoriesFailed: failedRepos,
      coverageRatio,
      changes,
      evidence: risk.evidence,
      overallSeverity: severity,
      limitations: [...snapshot.repositoriesFailed.map((f) => `Repo failure ${f.repository}: ${f.errorCode}`), ...risk.limitations, ...extraLimitations],
      durationMs: Date.now() - started,
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    return this.repository.create(assessment);
  }

  get(id: string): Assessment {
    const assessment = this.repository.get(id);
    if (!assessment) throw new Error(`Assessment ${id} was not found.`);
    return assessment;
  }

  decide(request: DecisionRequest): Assessment {
    const current = this.get(request.assessmentId);
    if (request.decision === 'APPROVE' && current.analysisStatus === 'INCOMPLETE') {
      throw new Error(`Cannot APPROVE release for INCOMPLETE assessment ${request.assessmentId}. Resolve missing evidence first.`);
    }
    if (request.decision === 'BLOCK' && (!request.reason || request.reason.trim().length < 3)) {
      throw new Error('A reason is required when BLOCKING a release.');
    }
    return this.repository.update(applyDecision(current, request));
  }
}

function snapshotResultToEvidenceItem(r: any) {
  return {
    id: r.evidenceId,
    sourceMode: 'live' as const,
    capturedAt: new Date().toISOString(),
    repository: r.repository,
    branch: r.branch,
    commitSha: r.commitSha,
    searchQuery: '',
    generatedFromChangeIds: [],
    filePath: r.filePath,
    lineStart: r.lineStart,
    lineEnd: r.lineEnd,
    snippet: r.snippet,
    contentHash: r.contentHash,
    htmlUrl: r.htmlUrl
  };
}

function computeTruthfulStatusAndSeverity(
  changes: ApiChange[],
  evidence: AssessedEvidence[],
  checkedCount: number,
  expectedCount: number,
  failedCount: number,
  classifierMode: string
): { status: AnalysisStatus; severity: 'HIGH' | 'MEDIUM' | 'LOW'; extraLimitations: string[] } {
  const breakingChanges = changes.filter((c) => c.breaking);
  const extraLimitations: string[] = [];

  const confirmedCount = evidence.filter((e) => e.classification === 'CONFIRMED_IMPACT').length;
  const likelyCount = evidence.filter((e) => e.classification === 'LIKELY_IMPACT' || e.classification === 'REVIEW_REQUIRED').length;

  let severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

  if (breakingChanges.length > 0) {
    if (confirmedCount > 0) {
      severity = 'HIGH';
    } else if (likelyCount > 0 || evidence.length === 0 || checkedCount === 0) {
      severity = 'MEDIUM';
    } else {
      severity = 'LOW';
    }
  }

  let status: AnalysisStatus = 'COMPLETE';

  if (checkedCount === 0 || (breakingChanges.length > 0 && evidence.length === 0)) {
    status = 'INCOMPLETE';
    extraLimitations.push('Assessment marked INCOMPLETE: breaking changes exist but no evidence was found or verified.');
  } else if (failedCount > 0 || likelyCount > 0 || classifierMode.includes('fallback')) {
    status = 'COMPLETE_WITH_WARNINGS';
  }

  return { status, severity, extraLimitations };
}
