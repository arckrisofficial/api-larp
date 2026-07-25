import { ExecutionContext, PromptDecorator as Prompt } from '@nitrostack/core';

export class ApiGuardPrompts {
  @Prompt({
    name: 'review_api_release',
    description: 'Prepare an MCP client to review a proposed API contract release through APIGuard.',
    arguments: [
      { name: 'scenario_id', description: 'Scenario or contract-pair identifier.', required: false },
      { name: 'release_context', description: 'Pull request or release context.', required: false }
    ]
  })
  async review(args: Record<string, string>, _ctx: ExecutionContext) {
    const scenario = args.scenario_id || 'risky';
    const context = args.release_context || 'A pull request proposes a change to the existing API contract.';
    return { messages: [
      { role: 'system', content: { type: 'text', text: 'You are a cautious API release reviewer. Use APIGuard tools and resources. Never claim a release is physically blocked by CI unless the tool output proves it.' } },
      { role: 'user', content: { type: 'text', text: `${context}
Run run_impact_assessment for scenarioId=${scenario}. Explain deterministic facts separately from LLM inferences. Ask for an explicit human decision only after showing evidence and limitations.` } }
    ] };
  }
}
