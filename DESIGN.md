# APIGuard Design

## Boundary

APIGuard is one NitroStack TypeScript MCP server. NitroStudio/NitroChat is the client. GitHub and model APIs are downstream dependencies behind application services.

## Service layout

- `DiffService`: deterministic OpenAPI 3.0 semantic subset
- `EvidenceService`: snapshot/live provider selection and provenance preservation
- `RiskService`: deterministic pre-filter, one bounded structured model call, safe fallback
- `AssessmentService`: orchestrates services and persists versioned state
- `FixService`: produces reviewed fix plans and gated draft PRs
- `ModelGateway`: OpenAI, Anthropic, and Gemini structured-output adapters
- `GitHubClient`: read, branch, content update, and draft PR operations

MCP tool handlers are thin wrappers. `run_impact_assessment` calls services directly rather than calling its own MCP tools through transport.

## Trust boundaries

1. OpenAPI contracts are validated before registration.
2. GitHub evidence is untrusted and provenance-tagged.
3. Source snippets/files are delimited as untrusted model input.
4. Model output is schema-validated and reconciled against known IDs and paths.
5. GitHub writes require a server flag, exact allow-list, explicit tool confirmation, pinned commit verification, and source hash verification.
6. PRs are draft-only by default and never auto-merged.

## Failure behavior

- model unavailable/invalid: ambiguous evidence becomes `REVIEW_REQUIRED`
- GitHub live failure: assessed as incomplete or use the committed snapshot path
- stale repository head/file: refuse PR creation
- duplicate release decision: idempotent
- conflicting decision/version: reject
- unsupported OpenAPI construct: emit `UNSUPPORTED_CHANGE`, never guess
