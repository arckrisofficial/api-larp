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
    || (process.env.NODE_ENV === 'production' ? 'dist/fixtures' : 'fixtures');
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
  readonly useLlm = bool('USE_LLM', false);
  readonly llmProvider = process.env.LLM_PROVIDER === 'anthropic' ? 'anthropic' as const : 'gemini' as const;
  readonly geminiKey = process.env.GEMINI_API_KEY ?? '';
  readonly geminiModel = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';
  readonly anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
  readonly anthropicModel = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
  readonly llmTimeoutMs = integer('LLM_TIMEOUT_MS', 7000);
  readonly maxEvidenceItems = integer('LLM_MAX_EVIDENCE_ITEMS', 8);
  readonly maxSnippetChars = integer('LLM_MAX_SNIPPET_CHARS', 1200);
  readonly actorId = process.env.DEMO_ACTOR_ID ?? 'judge-demo';
  readonly actorDisplayName = process.env.DEMO_ACTOR_DISPLAY_NAME ?? 'Hackathon Judge';
}
