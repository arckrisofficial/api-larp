import { ApiGuardConfig } from '../src/modules/apiguard/config.service.js';
import { SpecRepository } from '../src/modules/apiguard/spec.repository.js';
import { ContractService } from '../src/modules/apiguard/contract.service.js';
import { DiffService } from '../src/modules/apiguard/diff.service.js';
import { SnapshotEvidenceProvider } from '../src/modules/apiguard/snapshot-evidence.provider.js';
import { GitHubEvidenceProvider } from '../src/modules/apiguard/github-evidence.provider.js';
import { EvidenceSnapshotRepository } from '../src/modules/apiguard/evidence-snapshot.repository.js';
import { EvidenceService } from '../src/modules/apiguard/evidence.service.js';
import { RiskService } from '../src/modules/apiguard/risk.service.js';
import { AssessmentRepository } from '../src/modules/apiguard/assessment.repository.js';
import { AssessmentService } from '../src/modules/apiguard/assessment.service.js';
import { RepositoryScopeRepository } from '../src/modules/apiguard/repository-scope.repository.js';
import { RepositoryScopeService } from '../src/modules/apiguard/repository-scope.service.js';
import { ApiGuardTools } from '../src/modules/apiguard/apiguard.tools.js';

async function run() {
  console.log('Initializing E2E test components...');
  const config = new ApiGuardConfig();
  const specRepo = new SpecRepository(config);
  const contract = new ContractService(config);
  const diffService = new DiffService();
  const scopeRepo = new RepositoryScopeRepository(config);
  const snapshotRepo = new EvidenceSnapshotRepository(config);
  const snapProv = new SnapshotEvidenceProvider(config);
  const ghProv = new GitHubEvidenceProvider(config, scopeRepo);
  const evidenceService = new EvidenceService(config, snapProv, ghProv, snapshotRepo);
  const riskService = new RiskService(config);
  const assessmentRepo = new AssessmentRepository();
  const scopeService = new RepositoryScopeService(config, scopeRepo);
  const assessmentService = new AssessmentService(specRepo, diffService, evidenceService, riskService, assessmentRepo, scopeRepo);
  const tools = new ApiGuardTools(
    config,
    specRepo,
    contract,
    diffService,
    evidenceService,
    riskService,
    assessmentService,
    scopeService
  );

  const ctx = {
    auth: { subject: 'e2e-tester' },
    logger: { info: console.log, warn: console.warn, error: console.error },
    task: { progress: () => {} }
  } as any;

  console.log('\n--- 1. Diff API Spec ---');
  const diffResult = await tools.diffApiSpec({ scenarioId: 'audit_test_scen' }, ctx);
  console.log(diffResult.summary);

  console.log('\n--- 2. Manage Repository Scope ---');
  const scopeResult = await tools.manageRepositoryScope({
    action: 'ADD', owner: 'arckrisofficial', repository: 'api-larp', branch: 'main', reason: 'E2E Testing', confirmed: true
  }, ctx);
  console.log(`Action: ${scopeResult.action}, Changed: ${scopeResult.changed}, Version: ${scopeResult.scope.version}`);

  console.log('\n--- 3. Refresh Evidence ---');
  const refreshResult = await tools.refreshRepositoryEvidence({ scenarioId: 'audit_test_scen', forceRefresh: true }, ctx);
  console.log(`Snapshot: ${refreshResult.snapshotId}, Status: ${refreshResult.status}, Failed: ${refreshResult.repositoriesFailed.length}`);

  console.log('\n--- 4. Run Impact Assessment ---');
  const assessResult = await tools.runImpactAssessment({ scenarioId: 'audit_test_scen' }, ctx);
  console.log(`Assessment ID: ${assessResult.id}`);
  console.log(`Status: ${assessResult.analysisStatus}, Severity: ${assessResult.overallSeverity}`);

  console.log('\n--- 5. Record Release Decision ---');
  const decisionResult = await tools.recordDecision({
    assessmentId: assessResult.id,
    expectedVersion: assessResult.version || 1,
    decision: 'BLOCK',
    idempotencyKey: 'e2e-test-key-1',
    reason: 'E2E test verification',
  }, ctx);
  console.log(`Decision State: ${decisionResult.decision?.decision || decisionResult.decisionStatus}`);
  console.log('E2E TEST PASSED!');
}

run().catch((err) => {
  console.error('E2E TEST FAILED:', err);
  process.exit(1);
});
