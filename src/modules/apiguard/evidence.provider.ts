import type { ApiChange, EvidenceItem } from '../../domain/types.js';

export interface EvidenceDiscoveryResult {
  items: EvidenceItem[];
  limitations: string[];
  sourceMode: 'snapshot' | 'live';
}

export interface EvidenceProvider {
  discover(scenarioId: string, changes: ApiChange[]): Promise<EvidenceDiscoveryResult>;
}

export interface EvidenceSearchQuery {
  id: string;
  query: string;
  changeIds: string[];
}

export function fieldFromChange(change: ApiChange): string | undefined {
  const field = change.jsonPath?.split('.').pop()?.replace(/\[\]$/, '');
  return field && !field.startsWith('$') ? field : undefined;
}

export function queriesForChanges(changes: ApiChange[]): EvidenceSearchQuery[] {
  const byField = new Map<string, string[]>();
  for (const change of changes.filter((item) => item.breaking)) {
    const operationPath = change.code === 'OPERATION_REMOVED'
      ? change.operation.match(/^[A-Z]+\s+(.+)$/)?.[1]
      : undefined;
    const query = operationPath ?? fieldFromChange(change);
    if (!query) continue;
    byField.set(query, [...(byField.get(query) ?? []), change.id]);
  }
  return [...byField.entries()].map(([query, changeIds]) => ({
    id: `query_${query.replace(/[^a-z0-9_-]/gi, '_')}`,
    query,
    changeIds
  }));
}
