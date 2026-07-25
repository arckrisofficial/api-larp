import { ApiGuardConfig } from '../src/modules/apiguard/config.service.js';
import { SpecRepository } from '../src/modules/apiguard/spec.repository.js';
import { ContractService } from '../src/modules/apiguard/contract.service.js';
import { DiffService } from '../src/modules/apiguard/diff.service.js';
import { SnapshotEvidenceProvider } from '../src/modules/apiguard/snapshot-evidence.provider.js';
import { GitHubEvidenceProvider } from '../src/modules/apiguard/github-evidence.provider.js';
import { EvidenceSnapshotRepository } from '../src/modules/apiguard/evidence-snapshot.repository.js';
import { EvidenceService } from '../src/modules/apiguard/evidence.service.js';
import { RiskService } from '../src/modules/apiguard/risk.service.js';
import { ModelGateway } from '../src/modules/apiguard/model.gateway.js';
import { AssessmentRepository } from '../src/modules/apiguard/assessment.repository.js';
import { AssessmentService } from '../src/modules/apiguard/assessment.service.js';
import { RepositoryScopeRepository } from '../src/modules/apiguard/repository-scope.repository.js';
import { RepositoryScopeService } from '../src/modules/apiguard/repository-scope.service.js';
import { GitHubClient } from '../src/modules/apiguard/github.client.js';
import { FixPlanRepository } from '../src/modules/apiguard/fix-plan.repository.js';
import { FixService } from '../src/modules/apiguard/fix.service.js';
import { ApiGuardTools } from '../src/modules/apiguard/apiguard.tools.js';

async function run() {
  console.log('Initializing APIGuard E2E components...');
  process.env.USE_LIVE_GITHUB = 'false';
  process.env.USE_LLM = 'false';

  const config = new ApiGuardConfig();
  const specRepo = new SpecRepository(config);
  const contract = new ContractService(config);
  const diffService = new DiffService();
  const scopeRepo = new RepositoryScopeRepository(config);
  const scopeService = new RepositoryScopeService(config, scopeRepo);
  const snapshotRepo = new EvidenceSnapshotRepository(config);
  const snapshotProvider = new SnapshotEvidenceProvider(config);
  const githubProvider = new GitHubEvidenceProvider(config, scopeRepo, scopeService);
  const evidenceService = new EvidenceService(config, snapshotProvider, githubProvider, snapshotRepo);
  const modelGateway = new ModelGateway(config);
  const riskService = new RiskService(config, modelGateway);
  const assessmentRepo = new AssessmentRepository();
  const assessmentService = new AssessmentService(specRepo, diffService, evidenceService, riskService, assessmentRepo, scopeRepo);
  const githubClient = new GitHubClient(config);
  const fixPlanRepo = new FixPlanRepository();
  const fixService = new FixService(config, assessmentService, fixPlanRepo, githubClient, modelGateway);
  const tools = new ApiGuardTools(
    config,
    specRepo,
    contract,
    diffService,
    evidenceService,
    riskService,
    assessmentService,
    fixService
  );

  const ctx = {
    auth: { subject: 'e2e-tester', displayName: 'E2E Tester' },
    logger: { info: console.log, warn: console.warn, error: console.error },
    task: { progress: () => {} }
  } as any;

  console.log('\n--- 1. Diff API Spec ---');
  const diffResult = await tools.diffApiSpec({ scenarioId: 'risky' }, ctx);
  console.log(diffResult.summary);

  console.log('\n--- 2. Collect Consumer Evidence ---');
  const evidenceResult = await tools.collectConsumerEvidence({ scenarioId: 'risky' }, ctx);
  console.log(`Snapshot: ${evidenceResult.snapshotId}, Mode: ${evidenceResult.sourceMode}, Items: ${evidenceResult.evidenceCount}`);

  console.log('\n--- 3. Run Impact Assessment ---');
  const assessment = await tools.runImpactAssessment({ scenarioId: 'risky', snapshotId: evidenceResult.snapshotId }, ctx);
  console.log(`Assessment ID: ${assessment.id}`);
  console.log(`Status: ${assessment.analysisStatus}, Severity: ${assessment.overallSeverity}`);

  console.log('\n--- 4. Record Release Decision ---');
  const decision = await tools.recordReleaseDecision({
    assessmentId: assessment.id,
    expectedVersion: assessment.version,
    decision: 'BLOCK',
    idempotencyKey: `e2e-${assessment.id}`,
    reason: 'Consumer repositories require migration pull requests.'
  }, ctx);
  console.log(`Decision: ${decision.decisionStatus}`);

  console.log('\n--- 5. Propose Consumer Fixes ---');
  const fixPlan = await tools.proposeConsumerFixes({ assessmentId: assessment.id }, ctx);
  console.log(`Fix plan: ${fixPlan.id}, files: ${fixPlan.files.length}, mode: ${fixPlan.providerMode}`);
  console.log('E2E TEST PASSED');
}

run().catch((error) => {
  console.error('E2E TEST FAILED:', error);
  process.exit(1);
});
