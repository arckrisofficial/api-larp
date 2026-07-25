import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('public MCP tool surface is deliberate and contains no deprecated/admin tools', () => {
  const source = readFileSync('src/modules/apiguard/apiguard.tools.ts', 'utf8');
  const names = [...source.matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(names, [
    'register_api_contract_pair',
    'diff_api_spec',
    'collect_consumer_evidence',
    'assess_consumer_risk',
    'run_impact_assessment',
    'record_release_decision',
    'propose_consumer_fixes',
    'create_migration_pull_requests'
  ]);
  assert.doesNotMatch(source, /name:\s*'discover_consumer_evidence'/);
  assert.doesNotMatch(source, /name:\s*'manage_repository_scope'/);
  assert.doesNotMatch(source, /name:\s*'get_assessment'/);
});
