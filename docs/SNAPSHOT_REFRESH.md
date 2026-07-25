# Refreshing the Evidence Snapshot

The judged path uses a committed, provenance-tagged snapshot so the demo does not depend on GitHub latency or rate limits.

## Refresh from real public repositories

```bash
GITHUB_TOKEN=... \
DEMO_GITHUB_OWNER=<owner> \
DEMO_GITHUB_REPOSITORIES=react-consumer,python-consumer,go-consumer \
npm run snapshot:refresh
```

The refresh script uses the same GitHub evidence provider as live mode and writes:

- capture timestamp
- exact search queries
- repository branch and commit SHA
- file path and line range
- source excerpt
- content hash
- generated contract-change links

## Validation

```bash
npm test
npm run test:e2e
```

In NitroStudio, execute `collect_consumer_evidence` and confirm `sourceMode`, capture timestamp, commit SHAs and limitations are visible. Never describe the bundled demonstration repositories as production consumers.
