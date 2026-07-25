import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nitrostack/core';
import { sha256 } from '../../domain/hash.js';
import { normaliseOpenApi } from '../../domain/openapi-diff.js';
import type { ScenarioSpecs } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';

export interface RegisterContractInput {
  scenarioId?: string;
  baselineSpec?: Record<string, unknown> | string;
  candidateSpec?: Record<string, unknown> | string;
}

export interface RegisterContractResult {
  scenarioId: string;
  sourceType: 'INLINE';
  baselineSpecHash: string;
  candidateSpecHash: string;
  operationCountBaseline: number;
  operationCountCandidate: number;
  createdAt: string;
  resourceUris: {
    baseline: string;
    candidate: string;
  };
}

function parseJson(input: unknown, name: string): Record<string, unknown> {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Expected JSON object string for ${name}`);
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      throw new Error(`Failed to parse ${name} JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  throw new Error(`Invalid ${name}: expected a JSON object or string`);
}

function countOperations(spec: Record<string, unknown>): number {
  let count = 0;
  const paths = spec.paths;
  if (paths && typeof paths === 'object') {
    for (const pathObj of Object.values(paths as Record<string, unknown>)) {
      if (pathObj && typeof pathObj === 'object') {
        for (const method of Object.keys(pathObj as Record<string, unknown>)) {
          if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) {
            count++;
          }
        }
      }
    }
  }
  return count;
}

@Injectable({ deps: [ApiGuardConfig] })
export class ContractService {
  constructor(private readonly config: ApiGuardConfig) {}

  async register(input: RegisterContractInput): Promise<RegisterContractResult> {
    const baselineObj = parseJson(input.baselineSpec, 'baselineSpec');
    const candidateObj = parseJson(input.candidateSpec, 'candidateSpec');
    const sourceType: 'INLINE' = 'INLINE';

    // Validate the supported OpenAPI subset before persisting anything.
    normaliseOpenApi(baselineObj);
    normaliseOpenApi(candidateObj);

    const baselineHash = sha256(baselineObj);
    const candidateHash = sha256(candidateObj);

    const derivedId = input.scenarioId && /^[a-z0-9_-]+$/i.test(input.scenarioId)
      ? input.scenarioId
      : `scen_${sha256([baselineHash, candidateHash]).slice(0, 10)}`;

    const dir = path.resolve(process.cwd(), '.apiguard', 'scenarios', derivedId);
    const baselinePath = path.join(dir, 'baseline.openapi.json');
    const candidatePath = path.join(dir, 'candidate.openapi.json');

    if (existsSync(baselinePath) || existsSync(candidatePath)) {
      if (!existsSync(baselinePath) || !existsSync(candidatePath)) {
        throw new Error(`Contract pair ${derivedId} is incomplete on disk; remove it or repair both spec files.`);
      }
      const existingBaseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, unknown>;
      const existingCandidate = JSON.parse(readFileSync(candidatePath, 'utf8')) as Record<string, unknown>;
      if (sha256(existingBaseline) !== baselineHash || sha256(existingCandidate) !== candidateHash) {
        throw new Error(`Contract pair ${derivedId} already exists with different content. Use a new scenarioId.`);
      }
    } else {
      mkdirSync(dir, { recursive: true });
      writeFileSync(baselinePath, JSON.stringify(baselineObj, null, 2), 'utf8');
      writeFileSync(candidatePath, JSON.stringify(candidateObj, null, 2), 'utf8');
    }

    return {
      scenarioId: derivedId,
      sourceType,
      baselineSpecHash: baselineHash,
      candidateSpecHash: candidateHash,
      operationCountBaseline: countOperations(baselineObj),
      operationCountCandidate: countOperations(candidateObj),
      createdAt: new Date().toISOString(),
      resourceUris: {
        baseline: `apiguard://scenarios/${derivedId}/specs/baseline`,
        candidate: `apiguard://scenarios/${derivedId}/specs/candidate`
      }
    };
  }
}
