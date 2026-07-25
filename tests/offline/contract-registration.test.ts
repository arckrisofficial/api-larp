import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { ApiGuardConfig } from '../../src/modules/apiguard/config.service.js';
import { ContractService } from '../../src/modules/apiguard/contract.service.js';

const spec = (title: string) => ({ openapi: '3.0.3', info: { title, version: '1.0.0' }, paths: {} });

test('contract registration is idempotent but refuses scenario overwrite', async () => {
  const id = `test_${randomUUID().replace(/-/g, '')}`;
  const service = new ContractService(new ApiGuardConfig());
  try {
    const first = await service.register({ scenarioId: id, baselineSpec: spec('A'), candidateSpec: spec('B') });
    const repeat = await service.register({ scenarioId: id, baselineSpec: spec('A'), candidateSpec: spec('B') });
    assert.equal(first.baselineSpecHash, repeat.baselineSpecHash);
    await assert.rejects(
      service.register({ scenarioId: id, baselineSpec: spec('Different'), candidateSpec: spec('B') }),
      /already exists with different content/
    );
  } finally {
    rmSync(`.apiguard/scenarios/${id}`, { recursive: true, force: true });
  }
});

test('contract registration does not accept URL-only inputs', async () => {
  const service = new ContractService(new ApiGuardConfig());
  await assert.rejects(service.register({} as any), /baselineSpec/);
});
