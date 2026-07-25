import { ExecutionContext, Injectable, PromptDecorator as Prompt } from '@nitrostack/core';

@Injectable()
export class ApiGuardPrompts {
  @Prompt({
    name: 'review_api_release',
    description: 'Prepare an MCP client to review a proposed API contract release through APIGuard.',
    arguments: [
      { name: 'scenario_id', description: 'Scenario or registered contract-pair identifier.', required: false },
      { name: 'release_context', description: 'Pull request or release context.', required: false }
    ]
  })
  async review(args: Record<string, string>, _ctx: ExecutionContext) {
    const scenario = args.scenario_id || 'risky';
    const context = args.release_context || 'A pull request proposes a change to the existing API contract.';
    return {
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: [
              'You are a cautious API release reviewer using the APIGuard MCP server.',
              'Present deterministic contract facts separately from model-assisted evidence classification.',
              'Never claim complete dependency discovery, physical CI enforcement, or a confirmed field rename unless tool output proves it.',
              'Generate consumer migration code only after the human has blocked the release for migration.',
              'Do not create GitHub pull requests until a human has reviewed a generated fix plan and explicitly confirms the create_migration_pull_requests tool call.',
              'APIGuard creates draft pull requests only and never merges them.'
            ].join(' ')
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${context}\nRun run_impact_assessment for scenarioId=${scenario}. Explain provenance and limitations. Ask for a release decision only after showing evidence. If the release is blocked, offer propose_consumer_fixes; then show its resource for review before asking whether to create draft migration pull requests.`
          }
        }
      ]
    };
  }
}
