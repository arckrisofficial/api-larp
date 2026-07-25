# NitroCloud Deployment Checklist

## Before deployment

```bash
npm ci
npm run ci
npm run test:e2e
```

Confirm `.env` and all credentials are absent from Git.

## Safe production defaults

```dotenv
USE_LIVE_GITHUB=false
USE_LLM=false
APIGUARD_GITHUB_WRITE_ENABLED=false
DEMO_SCENARIO=risky
```

Deploy the repository through NitroStudio or connect the GitHub repository in NitroCloud. The production build copies both `fixtures/` and `demo-repositories/` into `dist/`.

## Deployed validation

1. Confirm the deployment is Live and copy the service/MCP URL.
2. Connect it to NitroStudio over HTTP.
3. Inspect all tools and resources.
4. Run `run_impact_assessment` for `risky`.
5. Verify the `api-impact-summary` widget renders.
6. Invoke `record_release_decision` and re-fetch the assessment resource.
7. Run `propose_consumer_fixes` and fetch its fix-plan resource.
8. Inspect MCP traffic logs for the correlated calls.
9. Run:

```bash
DEPLOYED_SERVICE_URL=<url> DEPLOYED_MCP_URL=<mcp-url> npm run smoke:deployed
```

## Optional live integrations

Enable one integration at a time and deploy a separate rehearsal instance:

- real model: `USE_LLM=true` plus exactly one provider key
- GitHub evidence: `USE_LIVE_GITHUB=true` plus read token and configured scope
- draft PRs: write flag, exact repository allow-list and fine-grained write token

Do not flip deployment environment variables on stage. Keep the stable snapshot deployment available.
