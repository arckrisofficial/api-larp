# APIGuard Final Codebase Evaluation

Date: 2026-07-26  
Integration branch: `integration/final-apiguard`  
Source branches reviewed: `main`, `jeffbezos`

## Executive assessment

The original branches contained two overlapping MCP surfaces and several competing approaches to contract registration, evidence retrieval, repository scope, risk classification, and UI state. The final integration keeps the useful implementation work from both branches while replacing the public surface with one deliberate NitroStack MCP application.

The resulting codebase is suitable for a hackathon submission after the team performs the final networked NitroStack build and deployment checks listed in `VERIFICATION.md`. The strongest parts are the deterministic/model boundary, versioned evidence provenance, fail-closed state transitions, and the new human-reviewed migration pull-request workflow. The main remaining limitations are deliberately scoped rather than hidden.

## Branch analysis

`main` already contained the useful `jeffbezos` history, including dynamic contract registration, EvidenceSnapshotV2, truthful assessment status, Gemini support, repository-scope persistence, and audit fixes. A second merge was therefore unnecessary and would have reintroduced duplicate tools.

The final integration branch was created from `main`. It preserves the stable widget/orchestrator/decision path while consolidating the strongest internal services from the other implementation.

## Final MCP boundary

### MCP server

The TypeScript NitroStack application under `src/` is the MCP server. It owns:

- NitroStack tool, resource, prompt, and widget registrations
- deterministic OpenAPI compatibility analysis
- snapshot/live GitHub evidence adapters
- bounded model-provider calls
- assessment and decision state
- migration fix plans
- guarded GitHub draft pull-request creation

### MCP clients

NitroStudio, NitroChat, ChatGPT, or another MCP-compatible host is the client. GitHub, OpenAI, Anthropic, and Gemini are downstream APIs used behind MCP tools, not additional MCP servers.

### Public tools

The public surface contains exactly eight tools:

1. `register_api_contract_pair`
2. `diff_api_spec`
3. `collect_consumer_evidence`
4. `assess_consumer_risk`
5. `run_impact_assessment`
6. `record_release_decision`
7. `propose_consumer_fixes`
8. `create_migration_pull_requests`

Deprecated `discover_consumer_evidence`, public repository-scope administration, and read-only `get_*`/`list_*` tools are not exposed.

### Resources

- `apiguard://scenarios`
- `apiguard://scenarios/{scenarioId}/specs/baseline`
- `apiguard://scenarios/{scenarioId}/specs/candidate`
- `apiguard://evidence-snapshots/{snapshotId}`
- `apiguard://assessments/{assessmentId}`
- `apiguard://fix-plans/{fixPlanId}`

The server also registers the `review_api_release` prompt and `api-impact-summary` widget.

## Implementation changes

### 1. Contract registration

- Accepts inline OpenAPI JSON objects or JSON strings.
- Rejects arbitrary URL ingestion to avoid SSRF, redirects, authentication ambiguity, and unreliable demo networking.
- Validates OpenAPI 3.0 documents before persistence.
- Uses stable content hashes and idempotent registration.
- Refuses silent overwrite of an existing scenario identifier.

### 2. Semantic diff engine

The diff engine is no longer a raw JSON-key comparison. It:

- validates OpenAPI 3.0 JSON
- resolves local JSON Pointer `$ref` chains
- rejects remote references and recursive schemas safely
- normalises operations, parameters, request bodies, response schemas, object properties, required sets, item schemas, and enums
- compares request and response compatibility in the correct direction
- emits typed changes with source pointers and deterministic IDs

Implemented change classes include:

- operation removal
- parameter removal
- existing or newly added parameter becoming required
- parameter schema type changes
- new required request body
- removal of a preferred success-response schema
- required response property removal
- required response property becoming optional
- request property becoming required
- property type changes
- request enum narrowing
- response enum widening
- optional property additions
- fail-closed `UNSUPPORTED_CHANGE` records for polymorphic constructs outside the MVP subset

The engine does not claim confirmed rename detection, OpenAPI 3.1, YAML, remote references, or complete polymorphic compatibility.

### 3. Evidence collection

- Snapshot and live GitHub modes implement the same provider contract.
- Snapshot fixtures are provenance-tagged with repository, branch, commit SHA, query, line range, and content hash.
- Snapshot compatibility is checked against the current scenario, contract hashes, and change IDs.
- Live search fetches source at the pinned commit before accepting a result.
- A search hit is discarded when the query does not occur in the pinned source; the provider never substitutes an unrelated first line.
- Live requests are scoped, capped, cached briefly, and rate-limit aware.
- A dynamic contract with no evidence snapshot degrades to an incomplete empty snapshot instead of crashing or claiming zero impact.
- The snapshot refresh script refuses to overwrite the committed fixture when expected repository coverage is incomplete.

### 4. Risk classification

- Test, documentation, and generated-code paths are filtered deterministically.
- Only ambiguous executable evidence reaches the model.
- Source snippets are treated as untrusted data.
- The model has no tools and cannot approve or write anything.
- Output is validated through Zod and reconciled against known evidence IDs, file paths, repositories, and deterministic change IDs.
- Hallucinated change IDs and migration paths are discarded or downgraded to manual review.
- Overall severity is computed in code, not accepted from the model.
- Missing evidence for breaking changes cannot produce a green assessment.
- Invalid output, timeout, or provider failure degrades to `REVIEW_REQUIRED`.

### 5. Multi-provider model gateway

One structured gateway supports:

- OpenAI Responses API with strict JSON Schema output
- Anthropic Messages API with a forced structured tool result
- Gemini Interactions API with JSON response format

All providers use the same validation contract and timeout. OpenAI requests disable response storage and cap output tokens. Anthropic requests avoid non-default sampling parameters that current Sonnet models reject. Gemini uses the current `/v1beta/interactions` endpoint, a separate system instruction, response schema, and output-token cap.

Real provider calls require the corresponding key. CI and the guaranteed demo do not require any model credentials.

### 6. Assessment and human decision state

- Analysis status and decision status are separate.
- Snapshot coverage and limitations are persisted.
- Approval is permitted only for a fully complete analysis.
- Blocking requires a reason.
- Decisions use optimistic version checks and idempotency keys.
- Conflicting second decisions are rejected.
- The assessment resource reflects the new state after the widget invokes the decision tool.
- The prototype records governed state but does not claim branch-protection or deployment enforcement.

### 7. Consumer code generation

The new `propose_consumer_fixes` tool:

- requires a completed assessment that a human explicitly blocked for migration
- loads complete source files from the exact evidence commit
- caps file count and file size
- treats complete source files as untrusted model input
- generates complete-file replacements through the selected provider
- accepts changes only for supplied repository/path pairs
- requires valid evidence and contract-change links
- rejects duplicate files, markdown-fenced output, unchanged output, invalid paths, and oversized output
- persists a reviewable fix plan without writing to GitHub

When external models are disabled, deterministic code generation is available only for the bundled demonstration fixtures. Live repositories never receive a heuristic fallback disguised as a safe fix.

Generated code remains a draft recommendation. It is not guaranteed to compile and must be reviewed and validated by the target repository's CI.

### 8. Draft migration pull requests

The `create_migration_pull_requests` tool:

- requires literal `confirmed: true`
- is disabled unless `APIGUARD_GITHUB_WRITE_ENABLED=true`
- requires an exact `owner/repository` allow-list
- requires a blocked assessment and matching assessment version
- verifies that the base branch still points to the evidence commit
- verifies every original source hash before writing
- creates a namespaced branch
- updates only files present in the reviewed fix plan
- creates draft pull requests
- never merges and never writes directly to the default branch
- refuses bundled fixture repositories
- is idempotent after successful publication

A multi-file GitHub write uses sequential Contents API commits. If a later file fails, an unmerged partial feature branch may remain, but the default branch is untouched and no successful PR is reported for that repository. For a production version, replace this with one atomic Git tree/commit operation.

### 9. Widget

The impact widget displays:

- contract changes
- assessed consumer evidence
- severity
- limitations
- snapshot/live mode
- snapshot identifier and capture time
- repository commit SHAs
- scope coverage
- decision state
- approve/block controls

Approval is disabled when the analysis is not fully complete. Blocking requires a reason. A typed-chat fallback can call the same decision tool if widget follow-up invocation fails.

### 10. Build, Docker, and CI

- Node 20 is enforced.
- GitHub Actions uses `npm ci`, type checking, all tests, widget type checking, NitroStack build, and the offline E2E flow.
- External models, live GitHub access, and GitHub writes are disabled in CI.
- The production build copies fixture and demo-repository assets into `dist`.
- The Docker runtime runs as the non-root `node` user.
- Runtime state directories are created with appropriate ownership.
- `.env.example` documents all supported variables.
- `.gitignore` excludes runtime state, secrets, build products, caches, and TypeScript build metadata.

## Test coverage

The final offline suite contains 34 passing tests covering:

- contract registration and overwrite protection
- semantic diff classes and compatibility direction
- local-reference recursion failure
- unsupported polymorphic-schema handling
- snapshot compatibility
- evidence provenance and stale-index protection
- dynamic-contract evidence degradation
- deterministic filters and prompt injection
- hallucinated model output reconciliation
- missing-evidence severity behavior
- all three model-provider request/response protocols
- assessment approval constraints
- decision state and idempotency
- fix-plan generation constraints
- draft-PR allow-listing, stale plans, draft mode, and idempotency
- exact public MCP tool surface

The offline end-to-end verification also passed:

```text
4 deterministic API changes
5 consumer evidence items
overall severity HIGH
release decision BLOCKED_PENDING_MIGRATION
consumer fix plan generated
```

## Known limitations

1. The environment used for this integration could not complete a fresh npm registry installation. The registry returned service/DNS failures. Static server and widget type checks, 34 compiled offline tests, and the offline integration flow passed, but the official NitroStack CLI build must be rerun on the team's networked machine.
2. No real OpenAI, Anthropic, or Gemini request was made because credentials were intentionally not included. Provider protocol behavior is covered with mocked HTTP tests.
3. No real GitHub pull request was created. GitHub write behavior is tested with a mocked client. Exercise it against a disposable allow-listed repository before enabling it on team repositories.
4. GitHub code search is scoped evidence collection, not a complete dependency graph.
5. File-backed runtime persistence is suitable for the prototype but is not a tamper-proof audit ledger and may be instance-lifetime depending on NitroCloud storage semantics.
6. Generated migration code is a draft. APIGuard does not currently run the target repository's formatter, compiler, or test suite before opening the draft PR.
7. The OpenAPI engine intentionally excludes OpenAPI 3.1, YAML, remote references, recursive schemas, and full polymorphic compatibility.
8. Repository-scope mutation exists internally for branch compatibility but is not exposed publicly as an MCP administration tool.

## Final deployment gate

Before submission, run on a networked machine:

```bash
rm -rf node_modules src/widgets/node_modules dist
npm ci
npm run ci
npm run test:e2e
npm run demo
```

Then:

1. Open the server in NitroStudio.
2. Confirm all eight tools, six resources, the prompt, and widget are visible.
3. Run the snapshot assessment and decision flow.
4. Fetch the updated assessment resource.
5. Inspect the MCP traffic logs.
6. Deploy to NitroCloud and run the deployed smoke script.
7. Test one model provider with a real key.
8. Test the PR workflow only on a disposable allow-listed repository.
9. Keep the snapshot/offline deployment as the judged fallback.

## Final engineering judgement

The integration is technically coherent and substantially stronger than either original branch by itself. It is a legitimate MCP server with a load-bearing capability surface, deterministic safety boundaries, honest data provenance, and a review-gated code-remediation path. The codebase is ready for final networked dependency installation, NitroStack build, live credential tests, and deployment rehearsal. No additional feature work should be added before those gates pass.
