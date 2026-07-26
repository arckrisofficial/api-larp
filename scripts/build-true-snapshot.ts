import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { diffOpenApi } from '../src/domain/openapi-diff.js';
import { sha256 } from '../src/domain/hash.js';
import { ApiGuardConfig } from '../src/modules/apiguard/config.service.js';
import { EvidenceSnapshotSchema } from '../src/modules/apiguard/evidence.schemas.js';
import { queriesForChanges } from '../src/modules/apiguard/evidence.provider.js';
import { RepositoryScopeRepository } from '../src/modules/apiguard/repository-scope.repository.js';
import fs from 'node:fs';

function execGh(endpoint: string): any {
  const result = execSync(`gh api "${endpoint}"`, { encoding: 'utf8' });
  return JSON.parse(result);
}

function excerptFor(source: string, query: string, maxChars: number) {
  const lines = source.split(/\r?\n/);
  const matchedIndex = lines.findIndex((line) => line.toLowerCase().includes(query.toLowerCase()));
  const index = matchedIndex >= 0 ? matchedIndex : 0;
  const start = Math.max(0, index - 1);
  const end = Math.min(lines.length, index + 2);
  const snippet = lines.slice(start, end).join('\n').slice(0, maxChars);
  return { snippet, lineStart: start + 1, lineEnd: Math.max(start + 1, end) };
}

async function main(): Promise<void> {
  const config = new ApiGuardConfig();
  const scenarioId = 'risky';
  const scenarioDir = path.resolve(process.cwd(), 'fixtures', 'scenarios', scenarioId);
  const baseline = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'baseline.openapi.json'), 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'candidate.openapi.json'), 'utf8'));
  
  const changes = diffOpenApi(baseline, candidate);
  const queries = queriesForChanges(changes);
  
  const scopeRepo = new RepositoryScopeRepository(config);
  const activeRepos = scopeRepo.listActive();
  
  const results = [];
  
  for (const repo of activeRepos) {
    const owner = repo.owner;
    const name = repo.name;
    const repoSlug = `${owner}/${name}`;
    const commitSha = repo.lastKnownCommitSha;
    const branch = repo.branch || 'main';
    
    // Determine the source file based on repo name
    let filePath = '';
    if (name.includes('react')) filePath = 'src/consumer.js';
    else if (name.includes('python')) filePath = 'src/consumer.py';
    else if (name.includes('go')) filePath = 'src/consumer.go';
    else continue;
    
    // Fetch file content
    let content = '';
    try {
      const fileData = execGh(`/repos/${owner}/${name}/contents/${filePath}?ref=${commitSha}`);
      content = Buffer.from(fileData.content.replace(/\s/g, ''), 'base64').toString('utf8');
    } catch (e) {
      console.warn(`Could not fetch ${filePath} for ${repoSlug}`);
      continue;
    }
    
    for (const query of queries) {
      if (!content.toLowerCase().includes(query.query.toLowerCase())) continue;
      
      const excerpt = excerptFor(content, query.query, config.maxSnippetChars);
      const snippetHash = sha256(excerpt.snippet);
      
      for (const changeId of query.changeIds) {
        results.push({
          evidenceId: `ev_${sha256([repoSlug, query.id, filePath, commitSha, changeId]).slice(0, 12)}`,
          queryId: query.id,
          repository: repoSlug,
          branch,
          commitSha,
          filePath,
          lineStart: excerpt.lineStart,
          lineEnd: excerpt.lineEnd,
          snippet: excerpt.snippet,
          contentHash: snippetHash,
          htmlUrl: `https://github.com/${owner}/${name}/blob/${commitSha}/${filePath}#L${excerpt.lineStart}-L${excerpt.lineEnd}`
        });
      }
    }
  }

  const queryMap = new Map(queries.map((q) => [q.query, q] as const));
  const snapshot = {
    schemaVersion: 1 as const,
    snapshotId: `${scenarioId}-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    generatedAt: new Date().toISOString(),
    sourceMode: 'snapshot' as const,
    origin: 'github' as const,
    githubApiVersion: '2022-11-28',
    scope: { owner: config.githubOwner, repositories: config.githubRepositories },
    queries: queries.map((query) => ({ queryId: query.id, query: query.query, generatedFromChangeIds: query.changeIds })),
    repositories: activeRepos.map(r => ({ owner: r.owner, name: r.name, defaultBranch: r.branch || 'main', commitSha: r.lastKnownCommitSha })),
    results
  };

  const validated = EvidenceSnapshotSchema.parse(snapshot);
  const output = path.join(scenarioDir, 'evidence.snapshot.json');
  await writeFile(output, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${validated.results.length} real evidence results to ${output}`);
}

main().catch(console.error);
