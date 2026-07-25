import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nitrostack/core';
import type { CreatedPullRequest, FixPlan, FixPlanFile } from '../../domain/fix-plan.js';
import { sha256 } from '../../domain/hash.js';
import type { ApiChange, AssessedEvidence } from '../../domain/types.js';
import { AssessmentService } from './assessment.service.js';
import { ApiGuardConfig } from './config.service.js';
import { FixPlanRepository } from './fix-plan.repository.js';
import { FIX_SYSTEM_PROMPT, fixUserPrompt } from './fix.prompt.js';
import { ModelFixPlanJsonSchema, ModelFixPlanOutputSchema } from './fix.schemas.js';
import { GitHubClient } from './github.client.js';
import { ModelGateway } from './model.gateway.js';

interface SourceFile {
  repository: string;
  branch: string;
  commitSha: string;
  filePath: string;
  content: string;
  evidence: AssessedEvidence[];
}

@Injectable({
  deps: [
    ApiGuardConfig,
    AssessmentService,
    FixPlanRepository,
    GitHubClient,
    ModelGateway
  ]
})
export class FixService {
  constructor(
    private readonly config: ApiGuardConfig,
    private readonly assessments: AssessmentService,
    private readonly plans: FixPlanRepository,
    private readonly github: GitHubClient,
    private readonly models: ModelGateway
  ) {}

  async propose(assessmentId: string): Promise<FixPlan> {
    const assessment = this.assessments.get(assessmentId);
    if (!['COMPLETE', 'COMPLETE_WITH_WARNINGS'].includes(assessment.analysisStatus)) {
      throw new Error(`Assessment ${assessmentId} is not complete enough to generate fixes.`);
    }
    if (assessment.decisionStatus !== 'BLOCKED_PENDING_MIGRATION') {
      throw new Error(
        `Assessment ${assessmentId} must be BLOCKED_PENDING_MIGRATION before APIGuard generates consumer code changes.`
      );
    }

    const impacted = assessment.evidence.filter((item) =>
      item.classification === 'CONFIRMED_IMPACT' || item.classification === 'LIKELY_IMPACT'
    );
    if (!impacted.length) throw new Error('No confirmed or likely consumer impacts are available for fix generation.');

    const grouped = groupEvidenceByFile(impacted).slice(0, this.config.fixMaxFiles);
    const limitations: string[] = [];
    if (grouped.length < groupEvidenceByFile(impacted).length) {
      limitations.push(`Fix generation was capped to ${this.config.fixMaxFiles} files.`);
    }

    const sourceFiles: SourceFile[] = [];
    for (const group of grouped) {
      try {
        sourceFiles.push(await this.loadSourceFile(group.repository, group.filePath, group.evidence));
      } catch (error) {
        limitations.push(`Skipped ${group.repository}/${group.filePath}: ${safeError(error)}`);
      }
    }
    if (!sourceFiles.length) throw new Error('No complete source files could be loaded for fix generation.');

    let files: FixPlanFile[];
    let providerMode: FixPlan['providerMode'];
    let modelProvider: FixPlan['modelProvider'];
    let modelName: string | undefined;

    if (this.config.useLlm) {
      try {
        const result = await this.models.generateStructured({
          taskName: 'apiguard_consumer_fix_plan',
          systemPrompt: FIX_SYSTEM_PROMPT,
          userPrompt: fixUserPrompt(assessment.changes, impacted, sourceFiles),
          jsonSchema: ModelFixPlanJsonSchema,
          validate: (value) => ModelFixPlanOutputSchema.parse(value),
          maxOutputTokens: 6000
        });
        files = reconcileModelFiles(
          sourceFiles,
          assessment.changes,
          result.output.files,
          limitations,
          this.config.fixMaxFileChars
        );
        limitations.push(...result.output.limitations);
        providerMode = 'llm';
        modelProvider = result.provider;
        modelName = result.model;
      } catch (error) {
        if (!sourceFiles.every((file) => file.repository.startsWith('bundled-fixtures/'))) {
          throw new Error(`Model fix generation failed; refusing unsafe automatic fallback for live repositories: ${safeError(error)}`);
        }
        limitations.push(`Model fix generation failed; used the deterministic bundled-fixture fallback: ${safeError(error)}`);
        files = deterministicFixturePlan(sourceFiles, assessment.changes, limitations);
        providerMode = 'deterministic-fixture';
      }
    } else {
      files = deterministicFixturePlan(sourceFiles, assessment.changes, limitations);
      providerMode = 'deterministic-fixture';
    }

    if (!files.length) throw new Error('The fix generator could not produce any safe file changes.');
    const now = new Date().toISOString();
    return this.plans.save({
      id: `fix_${randomUUID()}`,
      assessmentId: assessment.id,
      assessmentVersion: assessment.version,
      status: 'DRAFT',
      providerMode,
      modelProvider,
      modelName,
      files,
      limitations,
      createdPullRequests: [],
      createdAt: now,
      updatedAt: now,
      version: 1
    });
  }

  get(id: string): FixPlan {
    const plan = this.plans.get(id);
    if (!plan) throw new Error(`Fix plan ${id} was not found.`);
    return plan;
  }

  async publishPullRequests(fixPlanId: string): Promise<FixPlan> {
    const plan = this.get(fixPlanId);
    if (plan.createdPullRequests.length > 0 && ['PUBLISHED', 'PARTIALLY_PUBLISHED'].includes(plan.status)) {
      return plan;
    }
    if (!this.config.githubWriteEnabled) {
      throw new Error('GitHub write operations are disabled. Set APIGUARD_GITHUB_WRITE_ENABLED=true after reviewing the fix plan.');
    }
    if (!this.config.githubToken) throw new Error('GITHUB_TOKEN is required to create pull requests.');

    const assessment = this.assessments.get(plan.assessmentId);
    if (assessment.decisionStatus !== 'BLOCKED_PENDING_MIGRATION') {
      throw new Error(`Assessment ${assessment.id} is no longer blocked for migration; refusing GitHub writes.`);
    }
    if (assessment.version !== plan.assessmentVersion) {
      throw new Error(
        `Fix plan ${plan.id} was generated for assessment version ${plan.assessmentVersion}, but the current version is ${assessment.version}. Generate a fresh fix plan.`
      );
    }

    const byRepository = new Map<string, FixPlanFile[]>();
    for (const file of plan.files) {
      const list = byRepository.get(file.repository) ?? [];
      list.push(file);
      byRepository.set(file.repository, list);
    }

    const created: CreatedPullRequest[] = [];
    const failures: string[] = [];
    for (const [repository, files] of byRepository) {
      try {
        created.push(await this.publishRepository(plan, repository, files));
      } catch (error) {
        failures.push(`${repository}: ${safeError(error)}`);
      }
    }

    const updated: FixPlan = {
      ...plan,
      status: created.length === 0 ? 'FAILED' : failures.length > 0 ? 'PARTIALLY_PUBLISHED' : 'PUBLISHED',
      createdPullRequests: created,
      limitations: [...plan.limitations, ...failures.map((failure) => `Pull request not created: ${failure}`)],
      updatedAt: new Date().toISOString(),
      version: plan.version + 1
    };
    return this.plans.save(updated);
  }

  private async loadSourceFile(repository: string, filePath: string, evidence: AssessedEvidence[]): Promise<SourceFile> {
    const first = evidence[0];
    if (!first) throw new Error('Evidence group is empty.');
    let content: string;
    if (repository.startsWith('bundled-fixtures/')) {
      const repositoryName = repository.split('/')[1];
      if (!repositoryName) throw new Error(`Invalid fixture repository ${repository}.`);
      const root = path.resolve(process.cwd(), this.config.demoRepositoriesDir, repositoryName);
      const target = path.resolve(root, filePath);
      if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe fixture file path.');
      content = await readFile(target, 'utf8');
    } else {
      const [owner, name] = splitRepository(repository);
      content = (await this.github.getFile(owner, name, filePath, first.commitSha)).content;
    }

    if (content.length > this.config.fixMaxFileChars) {
      throw new Error(`File exceeds FIX_MAX_FILE_CHARS (${this.config.fixMaxFileChars}).`);
    }
    return {
      repository,
      branch: first.branch,
      commitSha: first.commitSha,
      filePath,
      content,
      evidence
    };
  }

  private async publishRepository(plan: FixPlan, repository: string, files: FixPlanFile[]): Promise<CreatedPullRequest> {
    if (repository.startsWith('bundled-fixtures/')) {
      throw new Error('Bundled fixture repositories are read-only. Configure real GitHub repositories for PR creation.');
    }
    if (!this.config.githubWritableRepositories.has(repository)) {
      throw new Error(`Repository is not in APIGUARD_WRITABLE_REPOSITORIES: ${repository}.`);
    }

    const [owner, name] = splitRepository(repository);
    const info = await this.github.getRepository(owner, name);
    const baseBranch = files[0]?.branch || info.defaultBranch;
    const baseCommitSha = files[0]?.baseCommitSha;
    if (!baseCommitSha) throw new Error('Fix plan contains no base commit SHA.');
    if (files.some((file) => file.branch !== baseBranch || file.baseCommitSha !== baseCommitSha)) {
      throw new Error('All files in a repository fix must use the same pinned branch and commit.');
    }

    const currentHead = await this.github.getBranchHead(owner, name, baseBranch);
    if (currentHead !== baseCommitSha) {
      throw new Error(`Repository is stale. Expected ${baseCommitSha}, current ${currentHead}. Re-run the assessment before writing.`);
    }

    const branch = `${sanitizeBranch(this.config.fixBranchPrefix)}/${plan.id.slice(0, 20)}`;
    await this.github.createBranch(owner, name, branch, baseCommitSha);
    let latestCommit = baseCommitSha;

    for (const file of files) {
      const current = await this.github.getFile(owner, name, file.filePath, baseCommitSha);
      if (sha256(current.content) !== file.originalContentHash) {
        throw new Error(`Source content changed for ${file.filePath}; refusing to overwrite stale code.`);
      }
      latestCommit = await this.github.updateFile(owner, name, {
        filePath: file.filePath,
        branch,
        originalBlobSha: current.sha,
        content: file.proposedContent,
        message: `fix(api): migrate ${file.filePath} for ${plan.assessmentId}`
      });
    }

    const pr = await this.github.createPullRequest(owner, name, {
      title: `APIGuard: migrate consumer for API contract update`,
      body: pullRequestBody(plan, repository, files),
      head: branch,
      base: baseBranch,
      draft: this.config.fixPrDraft
    });

    return {
      repository,
      branch,
      baseBranch,
      pullRequestNumber: pr.number,
      pullRequestUrl: pr.htmlUrl,
      commitSha: latestCommit,
      draft: this.config.fixPrDraft
    };
  }
}

function groupEvidenceByFile(evidence: AssessedEvidence[]): Array<{ repository: string; filePath: string; evidence: AssessedEvidence[] }> {
  const map = new Map<string, { repository: string; filePath: string; evidence: AssessedEvidence[] }>();
  for (const item of evidence) {
    const key = `${item.repository}\0${item.filePath}`;
    const group = map.get(key) ?? { repository: item.repository, filePath: item.filePath, evidence: [] };
    group.evidence.push(item);
    map.set(key, group);
  }
  return [...map.values()];
}

function reconcileModelFiles(
  sources: SourceFile[],
  changes: ApiChange[],
  modelFiles: Array<{
    repository: string;
    filePath: string;
    proposedContent: string;
    summary: string;
    relatedEvidenceIds: string[];
    relatedChangeIds: string[];
  }>,
  limitations: string[],
  maxFileChars: number
): FixPlanFile[] {
  const sourceMap = new Map(sources.map((source) => [`${source.repository}\0${source.filePath}`, source]));
  const changeIds = new Set(changes.map((change) => change.id));
  const output: FixPlanFile[] = [];
  const seenFiles = new Set<string>();
  for (const file of modelFiles) {
    const fileKey = `${file.repository}\0${file.filePath}`;
    const source = sourceMap.get(fileKey);
    if (!source) {
      limitations.push(`Model output for unapproved path was discarded: ${file.repository}/${file.filePath}.`);
      continue;
    }
    if (seenFiles.has(fileKey)) {
      limitations.push(`Duplicate model output was discarded: ${file.repository}/${file.filePath}.`);
      continue;
    }
    seenFiles.add(fileKey);
    if (file.proposedContent.length > maxFileChars) {
      limitations.push(`Model output exceeded FIX_MAX_FILE_CHARS and was discarded: ${file.repository}/${file.filePath}.`);
      continue;
    }
    if (/^```/m.test(file.proposedContent.trim())) {
      limitations.push(`Model returned markdown instead of complete source content: ${file.repository}/${file.filePath}.`);
      continue;
    }
    const evidenceIds = new Set(source.evidence.map((item) => item.id));
    const sourceChangeIds = new Set(source.evidence.flatMap((item) => item.matchedChangeIds));
    const relatedEvidenceIds = file.relatedEvidenceIds.filter((id) => evidenceIds.has(id));
    const relatedChangeIds = file.relatedChangeIds.filter((id) => changeIds.has(id) && sourceChangeIds.has(id));
    if (!relatedEvidenceIds.length || !relatedChangeIds.length) {
      limitations.push(`Model output lacked valid evidence/change links: ${file.repository}/${file.filePath}.`);
      continue;
    }
    if (file.proposedContent === source.content) {
      limitations.push(`Model proposed no content change for ${file.repository}/${file.filePath}.`);
      continue;
    }
    output.push({
      repository: source.repository,
      branch: source.branch,
      baseCommitSha: source.commitSha,
      filePath: source.filePath,
      originalContentHash: sha256(source.content),
      proposedContent: file.proposedContent,
      summary: file.summary,
      relatedEvidenceIds,
      relatedChangeIds
    });
  }
  return output;
}

function deterministicFixturePlan(sources: SourceFile[], changes: ApiChange[], limitations: string[]): FixPlanFile[] {
  const changeIds = changes.map((change) => change.id);
  const files: FixPlanFile[] = [];
  for (const source of sources) {
    let proposed = source.content;
    if (source.filePath.endsWith('.ts') || source.filePath.endsWith('.tsx')) {
      proposed = proposed
        .replace(/id:\s*number/g, 'id: string')
        .replace(/name:\s*string/g, 'fullName: string')
        .replace(/response\.name/g, 'response.fullName')
        .replace(/"active"\s*\|\s*"inactive"/g, '"active" | "inactive" | "suspended"');
    } else if (source.filePath.endsWith('.py')) {
      proposed = proposed.replace(/\bid:\s*int\b/g, 'id: str').replace(/\buser_id:\s*int\b/g, 'user_id: str');
    } else if (source.filePath.endsWith('.go') && proposed.includes('case "inactive":')) {
      proposed = proposed.replace('    case "inactive":\n        return "Inactive"', '    case "inactive":\n        return "Inactive"\n    case "suspended":\n        return "Suspended"');
    }

    if (proposed === source.content) {
      limitations.push(`Fixture fallback has no safe deterministic transform for ${source.filePath}.`);
      continue;
    }
    files.push({
      repository: source.repository,
      branch: source.branch,
      baseCommitSha: source.commitSha,
      filePath: source.filePath,
      originalContentHash: sha256(source.content),
      proposedContent: proposed,
      summary: 'Apply the candidate API contract types and field names while preserving unrelated behavior.',
      relatedEvidenceIds: source.evidence.map((item) => item.id),
      relatedChangeIds: [...new Set(source.evidence.flatMap((item) => item.matchedChangeIds.length ? item.matchedChangeIds : changeIds))]
    });
  }
  return files;
}

function splitRepository(repository: string): [string, string] {
  const parts = repository.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`Repository must be owner/name: ${repository}.`);
  return [parts[0], parts[1]];
}

function sanitizeBranch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'apiguard';
}

function pullRequestBody(plan: FixPlan, repository: string, files: FixPlanFile[]): string {
  return `## APIGuard consumer migration\n\n` +
    `Assessment: \`${plan.assessmentId}\` (version ${plan.assessmentVersion})\n\n` +
    `This is a **draft, human-reviewed migration PR** generated from deterministic OpenAPI changes and pinned consumer evidence. APIGuard never merges the PR.\n\n` +
    `### Files\n${files.map((file) => `- \`${file.filePath}\`: ${file.summary}`).join('\n')}\n\n` +
    `### Safety\n- Base repository: \`${repository}\`\n- Source commit: \`${files[0]?.baseCommitSha}\`\n- Source hashes were revalidated before writing.\n- Review and run the repository's CI before merging.\n`;
}

function safeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer ***')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .slice(0, 260);
}
