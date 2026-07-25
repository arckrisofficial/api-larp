# NitroStack Alignment

APIGuard is implemented with the official NitroStack TypeScript SDK as one MCP server.

## Registered surface

- 8 tools
- 6 resource URI patterns
- 1 prompt
- 1 interactive widget
- health checks and structured MCP traffic logs

## MCP legitimacy checklist

- Tool and resource registrations live inside the NitroStack module.
- Tool handlers expose Zod input schemas.
- Read-only retrieval uses resources rather than `get_*` tools.
- `run_impact_assessment` is the reliable demo orchestrator; granular tools remain independently inspectable.
- The orchestrator calls shared services directly and does not call its own MCP transport.
- The widget calls `record_release_decision` as a real follow-up tool invocation.
- NitroStudio/NitroChat is the MCP client; GitHub/model providers are downstream dependencies.

## Studio review sequence

1. Open Tools and inspect all eight tool schemas.
2. Fetch `apiguard://scenarios` and the baseline/candidate resources.
3. Execute `run_impact_assessment` in snapshot mode.
4. Inspect the rendered widget.
5. Block the assessment and re-fetch its resource.
6. Inspect MCP traffic logs.
7. Generate a fix plan and inspect its resource.
8. Show the NitroCloud service URL.

Do not demonstrate GitHub writes unless a dedicated test repository, fine-grained token and exact write allow-list are configured.
