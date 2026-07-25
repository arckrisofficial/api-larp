import { Injectable } from '@nitrostack/core';

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function integer(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

@Injectable()
export class ApiGuardConfig {
  readonly fixturesDir = process.env.APIGUARD_FIXTURES_DIR
    ?? (process.env.NODE_ENV === 'production' ? 'dist/fixtures' : 'fixtures');
  readonly demoScenario = process.env.DEMO_SCENARIO ?? 'risky';
  readonly useLiveGitHub = bool('USE_LIVE_GITHUB', false);
  readonly githubToken = process.env.GITHUB_TOKEN ?? '';
  readonly githubOwner = process.env.DEMO_GITHUB_OWNER ?? '';
  readonly githubRepositories = (process.env.DEMO_GITHUB_REPOSITORIES ?? '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);
  readonly githubMaxRequests = integer('GITHUB_MAX_REQUESTS', 40);
  readonly githubMaxMatchesPerQuery = integer('GITHUB_MAX_MATCHES_PER_QUERY', 2);
  readonly githubCacheTtlSeconds = integer('GITHUB_CACHE_TTL_SECONDS', 300);
  /** Path to the file-backed repository scope JSON store */
  readonly scopeFilePath = process.env.SCOPE_FILE_PATH ?? '.apiguard/repository-scope.json';
  /** Comma-separated list of GitHub owners allowed to be added to scope */
  readonly allowedGithubOwners = (process.env.ALLOWED_GITHUB_OWNERS ?? '')
    .split(',').map((s: string) => s.trim()).filter(Boolean);
  /** Maximum number of ACTIVE repositories allowed in scope at one time */
  readonly maxActiveRepositories = integer('MAX_ACTIVE_REPOSITORIES', 10);
  /** Bootstrap owner — used to pre-seed the registry from DEMO_GITHUB_REPOSITORIES on first start */
  readonly bootstrapGithubOwner = process.env.DEMO_GITHUB_OWNER ?? '';
  readonly useLlm = bool('USE_LLM', false);
  readonly llmProvider = (
    process.env.LLM_PROVIDER === 'anthropic' ? 'anthropic' :
    process.env.LLM_PROVIDER === 'gemini'    ? 'gemini'    : 'openai'
  ) as 'openai' | 'anthropic' | 'gemini';
  readonly openAiKey = process.env.OPENAI_API_KEY ?? '';
  readonly openAiModel = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  readonly anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
  readonly anthropicModel = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
  readonly geminiKey = process.env.GEMINI_API_KEY ?? '';
  readonly geminiModel = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
  readonly llmTimeoutMs = integer('LLM_TIMEOUT_MS', 7000);
  readonly maxEvidenceItems = integer('LLM_MAX_EVIDENCE_ITEMS', 8);
  readonly maxSnippetChars = integer('LLM_MAX_SNIPPET_CHARS', 1200);
  readonly actorId = process.env.DEMO_ACTOR_ID ?? 'judge-demo';
  readonly actorDisplayName = process.env.DEMO_ACTOR_DISPLAY_NAME ?? 'Hackathon Judge';
}
