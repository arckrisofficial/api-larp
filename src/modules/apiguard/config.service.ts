import { Injectable } from '@nitrostack/core';

function stringValue(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function integer(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function csv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);
}

@Injectable()
export class ApiGuardConfig {
  readonly fixturesDir = stringValue(
  'APIGUARD_FIXTURES_DIR',
  process.env.NODE_ENV === 'production'
    ? 'dist/fixtures'
    : 'fixtures'
);

  readonly demoRepositoriesDir = stringValue(
    'APIGUARD_DEMO_REPOSITORIES_DIR',
    process.env.NODE_ENV === 'production'
      ? 'dist/demo-repositories'
      : 'demo-repositories'
  );
  readonly demoScenario = process.env.DEMO_SCENARIO ?? 'risky';

  readonly useLiveGitHub = bool('USE_LIVE_GITHUB', false);
  readonly githubToken = process.env.GITHUB_TOKEN ?? '';
  readonly githubOwner = process.env.DEMO_GITHUB_OWNER ?? '';
  readonly githubRepositories = csv('DEMO_GITHUB_REPOSITORIES');
  readonly githubWritableRepositories = new Set(csv('APIGUARD_WRITABLE_REPOSITORIES'));
  readonly githubWriteEnabled = bool('APIGUARD_GITHUB_WRITE_ENABLED', false);
  readonly githubApiBaseUrl = (process.env.GITHUB_API_BASE_URL ?? 'https://api.github.com').replace(/\/$/, '');
  readonly githubApiVersion = process.env.GITHUB_API_VERSION ?? '2022-11-28';
  readonly githubMaxRequests = integer('GITHUB_MAX_REQUESTS', 40);
  readonly githubMaxMatchesPerQuery = integer('GITHUB_MAX_MATCHES_PER_QUERY', 2);
  readonly githubCacheTtlSeconds = integer('GITHUB_CACHE_TTL_SECONDS', 300);

  /** File-backed scope registry used internally. Public mutation is intentionally not exposed as an MCP tool. */
  readonly scopeFilePath = process.env.SCOPE_FILE_PATH ?? '.apiguard/repository-scope.json';
  readonly allowedGithubOwners = csv('ALLOWED_GITHUB_OWNERS');
  readonly maxActiveRepositories = integer('MAX_ACTIVE_REPOSITORIES', 10);
  readonly bootstrapGithubOwner = process.env.DEMO_GITHUB_OWNER ?? '';

  readonly useLlm = bool('USE_LLM', false);
  readonly llmProvider = (
    process.env.LLM_PROVIDER === 'anthropic' ? 'anthropic' :
    process.env.LLM_PROVIDER === 'gemini' ? 'gemini' : 'openai'
  ) as 'openai' | 'anthropic' | 'gemini';
  readonly llmTimeoutMs = integer('LLM_TIMEOUT_MS', 7000);
  readonly maxEvidenceItems = integer('LLM_MAX_EVIDENCE_ITEMS', 8);
  readonly maxSnippetChars = integer('LLM_MAX_SNIPPET_CHARS', 1200);

  readonly openAiKey = process.env.OPENAI_API_KEY ?? '';
  readonly openAiModel = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  readonly openAiBaseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');

  readonly anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
  readonly anthropicModel = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  readonly anthropicBaseUrl = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, '');
  readonly anthropicApiVersion = process.env.ANTHROPIC_API_VERSION ?? '2023-06-01';

  readonly geminiKey = process.env.GEMINI_API_KEY ?? '';
  readonly geminiModel = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
  readonly geminiBaseUrl = (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');

  readonly fixMaxFiles = integer('FIX_MAX_FILES', 6);
  readonly fixMaxFileChars = integer('FIX_MAX_FILE_CHARS', 24_000);
  readonly fixBranchPrefix = process.env.FIX_BRANCH_PREFIX ?? 'apiguard';
  readonly fixPrDraft = bool('FIX_PR_DRAFT', true);

  readonly actorId = process.env.DEMO_ACTOR_ID ?? 'judge-demo';
  readonly actorDisplayName = process.env.DEMO_ACTOR_DISPLAY_NAME ?? 'Hackathon Judge';
}
