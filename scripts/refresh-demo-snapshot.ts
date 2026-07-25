import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { diffOpenApi } from '../src/domain/openapi-diff.js';
import { sha256 } from '../src/domain/hash.js';
import { ApiGuardConfig } from '../src/modules/apiguard/config.service.js';
import { EvidenceSnapshotSchema } from '../src/modules/apiguard/evidence.schemas.js';
import { queriesForChanges } from '../src/modules/apiguard/evidence.provider.js';
import { GitHubEvidenceProvider } from '../src/modules/apiguard/github-evidence.provider.js';
import { RepositoryScopeRepository } from '../src/modules/apiguard/repository-scope.repository.js';
import { RepositoryScopeService } from '../src/modules/apiguard/repository-scope.service.js';

async function readJson(file: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(file, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected JSON object: ${file}`);
  return value as Record<string, unknown>;
}

async function main(): Promise<void> {
  const config = new ApiGuardConfig();
  if (!config.githubToken || !config.githubOwner || !config.githubRepositories.length) {
    throw new Error('Set GITHUB_TOKEN, DEMO_GITHUB_OWNER and DEMO_GITHUB_REPOSITORIES before refreshing the snapshot.');
  }
  const scenarioId = process.env.DEMO_SCENARIO ?? 'risky';
  const scenarioDir = path.resolve(process.cwd(), 'fixtures', 'scenarios', scenarioId);
  const baseline = await readJson(path.join(scenarioDir, 'baseline.openapi.json'));
  const candidate = await readJson(path.join(scenarioDir, 'candidate.openapi.json'));
  const changes = diffOpenApi(baseline, candidate);
  const scopeRepo = new RepositoryScopeRepository(config);
  const scopeService = new RepositoryScopeService(config, scopeRepo);
  await scopeService.bootstrapIfEmpty();
  const provider = new GitHubEvidenceProvider(config, scopeRepo, scopeService);
  const { result: live, snapshot: liveSnapshot } = await provider.discoverSnapshot(
    scenarioId,
    changes,
    sha256(baseline),
    sha256(candidate),
    true
  );
  if (
    liveSnapshot.repositoriesFailed.length > 0
    || liveSnapshot.repositoriesChecked.length !== liveSnapshot.repositoriesExpected.length
  ) {
    throw new Error(
      `Refusing to replace the committed demo snapshot because repository coverage was incomplete: `
      + `${liveSnapshot.repositoriesChecked.length}/${liveSnapshot.repositoriesExpected.length} checked, `
      + `${liveSnapshot.repositoriesFailed.length} failed.`
    );
  }
  const queries = queriesForChanges(changes);
  const queryMap = new Map(queries.map((query) => [query.query, query] as const));
  const snapshot = {
    schemaVersion: 1 as const,
    snapshotId: `${scenarioId}-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    generatedAt: new Date().toISOString(),
    sourceMode: 'snapshot' as const,
    origin: 'github' as const,
    githubApiVersion: '2022-11-28',
    scope: { owner: config.githubOwner, repositories: config.githubRepositories },
    queries: queries.map((query) => ({ queryId: query.id, query: query.query, generatedFromChangeIds: query.changeIds })),
    repositories: liveSnapshot.repositoriesExpected.map((repository) => ({
      owner: repository.owner,
      name: repository.name,
      defaultBranch: repository.branch,
      commitSha: repository.commitSha
    })),
    results: live.items.map((item) => ({
      evidenceId: item.id.replace(/^live_/, 'ev_'),
      queryId: queryMap.get(item.searchQuery)?.id ?? `query_${item.searchQuery}`,
      repository: item.repository,
      branch: item.branch,
      commitSha: item.commitSha,
      filePath: item.filePath,
      lineStart: item.lineStart,
      lineEnd: item.lineEnd,
      snippet: item.snippet,
      contentHash: sha256(item.snippet),
      htmlUrl: item.htmlUrl
    }))
  };
  const validated = EvidenceSnapshotSchema.parse(snapshot);
  await mkdir(scenarioDir, { recursive: true });
  const output = path.join(scenarioDir, 'evidence.snapshot.json');
  await writeFile(output, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${validated.results.length} evidence results to ${output}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
