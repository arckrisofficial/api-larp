import fs from 'fs';

const providerPath = '/home/narain_bk/Documents/NitroStack Hackathon/APIGuard-final-submission/APIGuard-final/src/modules/apiguard/github-evidence.provider.ts';
let content = fs.readFileSync(providerPath, 'utf8');

const innerLoopOld = `        try {
          for (const query of queries) {
            const q = \`"\${query.query}" repo:\${repoSlug}\`;
            const search = await request(\`/search/code?q=\${encodeURIComponent(q)}&per_page=\${this.config.githubMaxMatchesPerQuery}\`);
            const matches = Array.isArray(search.items) ? search.items.slice(0, this.config.githubMaxMatchesPerQuery) : [];

            for (const [index, raw] of matches.entries()) {
              if (!raw || typeof raw !== 'object') continue;
              const item = raw as Record<string, unknown>;
              const filePath = String(item.path ?? '');
              if (!filePath) continue;

              const source = await this.fetchSource(request, managedRepo.owner, managedRepo.name, filePath, commitSha);
              const excerpt = excerptFor(source, query.query, this.config.maxSnippetChars);
              // GitHub code search is eventually consistent and searches the indexed branch,
              // while APIGuard reads the exact pinned commit. Never turn a stale search result
              // into fabricated evidence from unrelated lines at the pinned commit.
              if (!excerpt) continue;
              const snippetHash = sha256(excerpt.snippet);
              const evidenceId = \`live_\${sha256([repoSlug, query.id, filePath, index, commitSha]).slice(0, 12)}\`;

              items.push({
                id: evidenceId,
                sourceMode: 'live',
                capturedAt: new Date().toISOString(),
                repository: repoSlug,
                branch: defaultBranch,
                commitSha,
                searchQuery: query.query,
                generatedFromChangeIds: query.changeIds,
                filePath,
                lineStart: excerpt.lineStart,
                lineEnd: excerpt.lineEnd,
                snippet: excerpt.snippet,
                contentHash: snippetHash,
                htmlUrl: typeof item.html_url === 'string' ? item.html_url : undefined
              });

              snapshotResults.push({
                evidenceId,
                repository: repoSlug,
                branch: defaultBranch,
                commitSha,
                queryId: query.id,
                filePath,
                lineStart: excerpt.lineStart,
                lineEnd: excerpt.lineEnd,
                snippet: excerpt.snippet,
                contentHash: snippetHash,
                htmlUrl: typeof item.html_url === 'string' ? item.html_url : undefined
              });
            }
          }
          repositoriesChecked.push(repoSlug);
        } catch (err) {`;

const innerLoopNew = `        try {
          const repoItems: EvidenceItem[] = [];
          const repoSnapshots: EvidenceSnapshotResult[] = [];

          for (const query of queries) {
            const q = \`"\${query.query}" repo:\${repoSlug}\`;
            const search = await request(\`/search/code?q=\${encodeURIComponent(q)}&per_page=\${this.config.githubMaxMatchesPerQuery}\`);
            const matches = Array.isArray(search.items) ? search.items.slice(0, this.config.githubMaxMatchesPerQuery) : [];

            for (const [index, raw] of matches.entries()) {
              if (!raw || typeof raw !== 'object') continue;
              const item = raw as Record<string, unknown>;
              const filePath = String(item.path ?? '');
              if (!filePath) continue;

              const source = await this.fetchSource(request, managedRepo.owner, managedRepo.name, filePath, commitSha);
              const excerpt = excerptFor(source, query.query, this.config.maxSnippetChars);
              if (!excerpt) continue;
              const snippetHash = sha256(excerpt.snippet);
              const evidenceId = \`live_\${sha256([repoSlug, query.id, filePath, index, commitSha]).slice(0, 12)}\`;

              repoItems.push({
                id: evidenceId,
                sourceMode: 'live',
                capturedAt: new Date().toISOString(),
                repository: repoSlug,
                branch: defaultBranch,
                commitSha,
                searchQuery: query.query,
                generatedFromChangeIds: [...query.changeIds],
                filePath,
                lineStart: excerpt.lineStart,
                lineEnd: excerpt.lineEnd,
                snippet: excerpt.snippet,
                contentHash: snippetHash,
                htmlUrl: typeof item.html_url === 'string' ? item.html_url : undefined,
                discoveryMethod: 'GITHUB_CODE_SEARCH'
              });

              repoSnapshots.push({
                evidenceId,
                repository: repoSlug,
                branch: defaultBranch,
                commitSha,
                queryId: query.id,
                filePath,
                lineStart: excerpt.lineStart,
                lineEnd: excerpt.lineEnd,
                snippet: excerpt.snippet,
                contentHash: snippetHash,
                htmlUrl: typeof item.html_url === 'string' ? item.html_url : undefined,
                discoveryMethod: 'GITHUB_CODE_SEARCH'
              });
            }
          }

          if (repoItems.length === 0) {
            console.warn(\`[GitHubEvidenceProvider] Code Search returned zero matches for \${repoSlug}; using pinned-tree fallback.\`);
            
            const treeFiles = await this.listSourceFiles(request, managedRepo.owner, managedRepo.name, commitSha);
            
            const treeItemsMap = new Map<string, EvidenceItem>();
            const treeSnapshotsMap = new Map<string, EvidenceSnapshotResult>();
            
            for (const filePath of treeFiles) {
              const source = await this.fetchSource(request, managedRepo.owner, managedRepo.name, filePath, commitSha);
              
              for (const query of queries) {
                const matches = findMatches(source, query.query);
                
                for (const match of matches) {
                  const excerpt = buildSnippet(source, match.lineNumber, 3);
                  const snippet = excerpt.snippet.slice(0, this.config.maxSnippetChars);
                  const snippetHash = sha256(snippet);
                  
                  const dedupKey = \`\${repoSlug}:\${commitSha}:\${filePath}:\${excerpt.lineStart}:\${excerpt.lineEnd}\`;
                  
                  if (treeItemsMap.has(dedupKey)) {
                    const existingItem = treeItemsMap.get(dedupKey)!;
                    for (const cid of query.changeIds) {
                       if (!existingItem.generatedFromChangeIds.includes(cid)) {
                           existingItem.generatedFromChangeIds.push(cid);
                       }
                    }
                  } else {
                    const evidenceId = \`live_\${sha256([repoSlug, query.id, filePath, match.lineNumber, commitSha]).slice(0, 12)}\`;
                    
                    const newItem = {
                      id: evidenceId,
                      sourceMode: 'live',
                      capturedAt: new Date().toISOString(),
                      repository: repoSlug,
                      branch: defaultBranch,
                      commitSha,
                      searchQuery: query.query,
                      generatedFromChangeIds: [...query.changeIds],
                      filePath,
                      lineStart: excerpt.lineStart,
                      lineEnd: excerpt.lineEnd,
                      snippet,
                      contentHash: snippetHash,
                      discoveryMethod: 'PINNED_TREE_SCAN'
                    };
                    
                    treeItemsMap.set(dedupKey, newItem as EvidenceItem);
                    
                    treeSnapshotsMap.set(dedupKey, {
                      evidenceId,
                      repository: repoSlug,
                      branch: defaultBranch,
                      commitSha,
                      queryId: query.id,
                      filePath,
                      lineStart: excerpt.lineStart,
                      lineEnd: excerpt.lineEnd,
                      snippet,
                      contentHash: snippetHash,
                      discoveryMethod: 'PINNED_TREE_SCAN'
                    });
                  }
                }
              }
            }
            
            repoItems.push(...treeItemsMap.values());
            repoSnapshots.push(...treeSnapshotsMap.values());
          }

          items.push(...repoItems);
          snapshotResults.push(...repoSnapshots);

          repositoriesChecked.push(repoSlug);
        } catch (err) {`;

content = content.replace(innerLoopOld, innerLoopNew);


const methodsOld = `  private async fetchSource(`;
const methodsNew = `  private async listSourceFiles(
    request: (endpoint: string, accept?: string) => Promise<Record<string, unknown>>,
    owner: string,
    repository: string,
    commitSha: string,
  ): Promise<string[]> {
    const response = await request(
      \`/repos/\${encodeURIComponent(owner)}/\${encodeURIComponent(repository)}/git/trees/\${encodeURIComponent(commitSha)}?recursive=1\`
    );

    if (response.truncated) {
      console.warn(\`[GitHubEvidenceProvider] GitHub tree was truncated for \${owner}/\${repository}.\`);
    }

    const tree = Array.isArray(response.tree) ? response.tree as GitHubTreeItem[] : [];

    return tree
      .filter(item => item.type === 'blob')
      .map(item => String(item.path))
      .filter(isSupportedSourceFile)
      .slice(0, 100);
  }

  private async fetchSource(`;

content = content.replace(methodsOld, methodsNew);


const topOld = `import { sha256 } from '../../domain/hash.js';`;
const topNew = `import { sha256 } from '../../domain/hash.js';

interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.go',
  '.java',
  '.kt',
  '.rs',
  '.cs',
]);

function isSupportedSourceFile(path) {
  const normalized = path.toLowerCase();

  if (
    normalized.includes('/node_modules/') ||
    normalized.includes('/vendor/') ||
    normalized.includes('/dist/') ||
    normalized.includes('/build/') ||
    normalized.includes('/coverage/')
  ) {
    return false;
  }

  return [...SOURCE_EXTENSIONS].some(extension =>
    normalized.endsWith(extension),
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^\\$\\{\\}()|[\\]\\\\]/g, '\\\\$&');
}

function findMatches(
  source,
  property,
) {
  const lines = source.split(/\\r?\\n/);

  const patterns = [
    new RegExp(\`\\\\b\${escapeRegex(property)}\\\\b\`, 'i'),
    new RegExp(\`\\\\.\${escapeRegex(property)}\\\\b\`, 'i'),
    new RegExp(\`["']\${escapeRegex(property)}["']\`, 'i'),
    new RegExp(\`json:["']\${escapeRegex(property)}["']\`, 'i'),
  ];

  return lines.flatMap((line, index) => {
    if (!patterns.some(pattern => pattern.test(line))) {
      return [];
    }
    return [
      {
        lineNumber: index + 1,
        line,
      },
    ];
  });
}

function buildSnippet(
  source,
  lineNumber,
  radius = 3,
) {
  const lines = source.split(/\\r?\\n/);

  const start = Math.max(0, lineNumber - 1 - radius);
  const end = Math.min(lines.length, lineNumber + radius);

  return {
    lineStart: start + 1,
    lineEnd: end,
    snippet: lines.slice(start, end).join('\\n'),
  };
}
`;

content = content.replace(topOld, topNew);


fs.writeFileSync(providerPath, content);
console.log('Successfully updated github-evidence.provider.ts');
