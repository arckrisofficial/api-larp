import { Module } from '@nitrostack/core';
import { ApiGuardConfig } from './config.service.js';
import { SpecRepository } from './spec.repository.js';
import { ContractService } from './contract.service.js';
import { DiffService } from './diff.service.js';
import { EvidenceService } from './evidence.service.js';
import { SnapshotEvidenceProvider } from './snapshot-evidence.provider.js';
import { GitHubEvidenceProvider } from './github-evidence.provider.js';
import { EvidenceSnapshotRepository } from './evidence-snapshot.repository.js';
import { RiskService } from './risk.service.js';
import { AssessmentRepository } from './assessment.repository.js';
import { AssessmentService } from './assessment.service.js';
import { RepositoryScopeRepository } from './repository-scope.repository.js';
import { RepositoryScopeService } from './repository-scope.service.js';
import { ApiGuardTools } from './apiguard.tools.js';
import { ApiGuardResources } from './apiguard.resources.js';
import { ApiGuardPrompts } from './apiguard.prompts.js';
import { SystemLiveness, SystemReadiness } from './system.health.js';

@Module({
  name: 'apiguard',
  description: 'API contract impact assessment and governed release-decision capabilities.',
  controllers: [ApiGuardTools, ApiGuardResources, ApiGuardPrompts],
  providers: [
    ApiGuardConfig,
    SpecRepository,
    ContractService,
    DiffService,
    SnapshotEvidenceProvider,
    GitHubEvidenceProvider,
    EvidenceSnapshotRepository,
    EvidenceService,
    RiskService,
    AssessmentRepository,
    AssessmentService,
    RepositoryScopeRepository,
    RepositoryScopeService,
    SystemLiveness,
    SystemReadiness
  ],
  exports: [AssessmentService, ContractService, EvidenceService]
})
export class ApiGuardModule {}
