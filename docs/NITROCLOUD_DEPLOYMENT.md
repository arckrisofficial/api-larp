# NitroCloud and Chat Client Deployment Checklist

This checklist is the final networked-machine step. The preparation VM could not reach npm or authenticate to NitroCloud, so these steps must be executed by the team.

## 1. Install and verify

Use Node.js 20.18 or later within the Node 20 line.

```bash
node -v
npm -v
npm install
npm run check
```

`npm install` also installs the widget workspace through the root `postinstall` script.

## 2. Test locally in NitroStudio

```bash
npm run dev
```

In NitroStudio:

1. Add MCP Server.
2. Choose **Nitro Project**.
3. Select this repository.
4. Open **Studio App Canvas**.
5. Execute all five tools manually.
6. Fetch all three resources.
7. Run the `review_api_release` prompt.
8. Preview `api-impact-summary`.
9. Trigger `run_impact_assessment` in AI Chat.
10. Block the assessment and fetch its updated resource.
11. Inspect MCP traffic and server logs.

## 3. Refresh GitHub provenance

The committed snapshot is an offline fixture and labels itself honestly. After the demonstration repositories are public:

```bash
cp .env.example .env
# Set a fine-grained, read-only GITHUB_TOKEN.
# Set DEMO_GITHUB_OWNER and DEMO_GITHUB_REPOSITORIES.
npm run snapshot:refresh
npm run verify:offline
```

Commit the refreshed `fixtures/scenarios/risky/evidence.snapshot.json`. It will contain `origin: "github"`, real repository names, branches, commit SHAs, queries and content hashes.

## 4. Push the stable default branch

```bash
git status
git add .
git commit -m "feat: ship APIGuard NitroStack MCP server"
git push origin main
```

The repository must remain public and must not contain `.env`, tokens or credentials.

## 5. Deploy to NitroCloud

Use NitroStudio or NitroCloud's GitHub deployment flow:

1. Sign in to NitroStudio/NitroCloud.
2. Create a NitroCloud project for `api-larp`.
3. Connect the public GitHub repository.
4. Select the stable default branch.
5. Add only the required environment variables in the NitroCloud dashboard.
6. Keep `USE_LIVE_GITHUB=false` for the main judged deployment.
7. Keep `USE_LLM=false` for a fully deterministic fallback deployment, or enable one tested provider for the primary demo.
8. Deploy.
9. Wait for **Pending → Building → Deploying → Live**.
10. Copy the Service URL and MCP URL.

Recommended primary deployment:

```dotenv
NODE_ENV=production
USE_LIVE_GITHUB=false
USE_LLM=true
LLM_PROVIDER=openai
OPENAI_API_KEY=<NitroCloud secret>
DEMO_SCENARIO=risky
LOG_LEVEL=info
```

Recommended backup deployment:

```dotenv
NODE_ENV=production
USE_LIVE_GITHUB=false
USE_LLM=false
DEMO_SCENARIO=risky
LOG_LEVEL=info
```

## 6. Validate the deployed MCP server

```bash
DEPLOYED_SERVICE_URL=https://... \
DEPLOYED_MCP_URL=https://.../sse \
npm run smoke:deployed
```

Then connect the remote MCP URL in NitroStudio using **Other Project → HTTP / Streamable HTTP** and repeat the complete workflow.

## 7. Connect to a chat client

The supplied handbook describes the NitroCloud MCP URL as the service URL with the MCP endpoint shown in the deployment guide, commonly ending in `/sse`.

For a compatible ChatGPT developer connection:

1. Open the live NitroCloud app.
2. Copy the MCP URL from the deployment details/ChatGPT guide.
3. Enable developer mode in the client where supported.
4. Add the app using the copied MCP URL.
5. Connect it.
6. Start a new chat.
7. Ask: `Assess the risky API release scenario before merge.`
8. Confirm that the client invokes `run_impact_assessment` and renders the widget.

## 8. Final production smoke flow

1. Fetch baseline resource.
2. Fetch candidate resource.
3. Execute `diff_api_spec`.
4. Execute `discover_consumer_evidence`.
5. Execute `assess_consumer_risk`.
6. Execute `run_impact_assessment`.
7. Record a block decision with a reason.
8. Fetch `apiguard://assessments/{assessmentId}`.
9. Verify the version increment and `BLOCKED_PENDING_MIGRATION` state.
10. Check logs for the correlated tool calls.

## 9. Submission

- Public repository complete and accessible.
- Latest code pushed.
- NitroCloud deployment Live.
- Tools/resources/widget tested remotely.
- Maximum three-minute submission video recorded.
- Official Sample Apps submission completed.
- Official NitroCloud dashboard submission completed.
