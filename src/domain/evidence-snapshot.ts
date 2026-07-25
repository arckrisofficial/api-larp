export interface EvidenceSnapshotQuery {
  queryId: string;
  query: string;
  generatedFromChangeIds: string[];
}

export interface EvidenceSnapshotResult {
  evidenceId: string;
  repository: string;
  branch: string;
  commitSha: string;
  queryId: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  contentHash: string;
  htmlUrl?: string;
}

export interface EvidenceSnapshotV2 {
  schemaVersion: 2;
  snapshotId: string;
  scenarioId: string;
  origin: 'FIXTURE' | 'GITHUB';
  baselineSpecHash: string;
  candidateSpecHash: string;
  repositoryScopeVersion: number;
  queryPlanHash: string;
  generatedAt: string;
  repositoriesExpected: Array<{
    owner: string;
    name: string;
    branch: string;
    commitSha: string;
  }>;
  repositoriesChecked: string[];
  repositoriesFailed: Array<{
    repository: string;
    errorCode: string;
  }>;
  queries: EvidenceSnapshotQuery[];
  results: EvidenceSnapshotResult[];
}
