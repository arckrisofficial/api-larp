# APIGuard Product Definition

## User

Platform engineers and API owners reviewing a proposed OpenAPI contract change before merge or release.

## Job to be done

Convert provider-side compatibility changes into scoped consumer-code evidence, a transparent risk assessment, a human release decision, and optionally reviewable draft migration pull requests.

## Core promise

APIGuard does not claim complete dependency discovery or automatic deployment enforcement. It produces a versioned evidence package and controlled developer workflow through a NitroStack MCP server.

## Product principles

1. Deterministic facts before model inference.
2. Evidence provenance is visible.
3. Model failure never becomes a green result.
4. Human decisions change server-side state.
5. Generated code is a draft for review, never an auto-merge.
6. External writes are disabled and allow-listed by default.
7. Snapshot mode is a first-class reproducible path, not hidden mock data.

## Demo success criteria

- Tools/resources/prompt/widget are visible in NitroStudio.
- `run_impact_assessment` completes from the deployed MCP server.
- The widget shows source mode, compatibility changes, evidence, limitations and severity.
- Approve/Block invokes `record_release_decision` and the assessment resource reflects the new state.
- `propose_consumer_fixes` produces a readable fix-plan resource.
- Draft PR creation is shown only against configured test repositories with explicit confirmation.
