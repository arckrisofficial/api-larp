import { HealthCheck, HealthCheckInterface, HealthCheckResult, Injectable } from '@nitrostack/core';
import { ApiGuardConfig } from './config.service.js';

@Injectable()
@HealthCheck({ name: 'apiguard-liveness', description: 'APIGuard System Liveness Check' })
export class SystemLiveness implements HealthCheckInterface {
  async check(): Promise<HealthCheckResult> {
    return {
      status: 'up',
      message: 'APIGuard MCP server is running.',
      details: {
        uptimeSeconds: Math.floor(process.uptime()),
        node: process.version
      }
    };
  }
}

@Injectable({ deps: [ApiGuardConfig] })
@HealthCheck({ name: 'apiguard-readiness', description: 'APIGuard System Readiness Check' })
export class SystemReadiness implements HealthCheckInterface {
  constructor(private readonly config: ApiGuardConfig) {}

  async check(): Promise<HealthCheckResult> {
    if (this.config.useLiveGitHub && !this.config.githubToken) {
      return {
        status: 'down',
        message: 'APIGuard is improperly configured: USE_LIVE_GITHUB=true but GITHUB_TOKEN is missing.'
      };
    }

    const selectedModelKey = this.config.llmProvider === 'anthropic'
      ? this.config.anthropicKey
      : this.config.llmProvider === 'gemini'
        ? this.config.geminiKey
        : this.config.openAiKey;
    if (this.config.useLlm && !selectedModelKey) {
      return {
        status: 'down',
        message: `APIGuard is improperly configured: USE_LLM=true but the ${this.config.llmProvider} API key is missing.`
      };
    }

    if (this.config.githubWriteEnabled && (!this.config.githubToken || this.config.githubWritableRepositories.size === 0)) {
      return {
        status: 'down',
        message: 'APIGuard GitHub writes require GITHUB_TOKEN and APIGUARD_WRITABLE_REPOSITORIES.'
      };
    }

    return {
      status: 'up',
      message: 'APIGuard is ready to accept requests.',
      details: {
        evidenceMode: this.config.useLiveGitHub ? 'live' : 'snapshot',
        classifierMode: this.config.useLlm ? this.config.llmProvider : 'deterministic-fallback',
      }
    };
  }
}

