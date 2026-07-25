import { HealthCheck, HealthCheckInterface, HealthCheckResult, Injectable } from '@nitrostack/core';
import { ApiGuardConfig } from './config.service.js';

@Injectable()
@HealthCheck({ name: 'apiguard-system', description: 'APIGuard System Health Check' })
export class SystemHealth implements HealthCheckInterface {
  constructor(private readonly config: ApiGuardConfig) {}

  async check(): Promise<HealthCheckResult> {
    return {
      status: 'up',
      message: 'APIGuard MCP server is operational.',
      details: {
        uptimeSeconds: Math.floor(process.uptime()),
        evidenceMode: this.config.useLiveGitHub ? 'live' : 'snapshot',
        classifierMode: this.config.useLlm ? this.config.llmProvider : 'deterministic-fallback',
        node: process.version
      }
    };
  }
}

