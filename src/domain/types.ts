export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';
export type OperationKey = `${Uppercase<HttpMethod>} ${string}`;

export type ChangeCode =
  | 'OPERATION_REMOVED'
  | 'PARAMETER_REMOVED'
  | 'PARAMETER_BECAME_REQUIRED'
  | 'REQUEST_BODY_BECAME_REQUIRED'
  | 'RESPONSE_SCHEMA_REMOVED'
  | 'REQUIRED_PROPERTY_REMOVED'
  | 'REQUIRED_PROPERTY_BECAME_OPTIONAL'
  | 'PROPERTY_BECAME_REQUIRED'
  | 'PROPERTY_TYPE_CHANGED'
  | 'ENUM_NARROWED'
  | 'ENUM_WIDENED'
  | 'OPTIONAL_PROPERTY_ADDED'
  | 'UNSUPPORTED_CHANGE';

export interface ApiChange {
  id: string;
  code: ChangeCode;
  breaking: boolean;
  operation: string;
  location: 'path' | 'query' | 'header' | 'request' | 'response' | 'operation';
  jsonPath?: string;
  before?: unknown;
  after?: unknown;
  rationale: string;
  sourcePointers: { baseline?: string; candidate?: string };
}

export interface EvidenceItem {
  id: string;
  sourceMode: 'snapshot' | 'live';
  capturedAt: string;
  repository: string;
  branch: string;
  commitSha: string;
  searchQuery: string;
  generatedFromChangeIds: string[];
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  contentHash: string;
  htmlUrl?: string;
}

export type EvidenceClassification =
  | 'CONFIRMED_IMPACT'
  | 'LIKELY_IMPACT'
  | 'FALSE_POSITIVE'
  | 'REVIEW_REQUIRED'
  | 'TEST_ONLY'
  | 'DOCUMENTATION_ONLY'
  | 'GENERATED_CODE';

export interface MigrationAction {
  title: string;
  description: string;
  repository: string;
  filePath: string;
  lineNumber?: number;
  relatedChangeIds: string[];
}

export interface AssessedEvidence extends EvidenceItem {
  classification: EvidenceClassification;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchedChangeIds: string[];
  reasoning: string;
  migrationActions: MigrationAction[];
}

export type AnalysisStatus = 'RUNNING' | 'COMPLETE' | 'COMPLETE_WITH_WARNINGS' | 'INCOMPLETE' | 'FAILED';
export type DecisionStatus = 'PENDING' | 'APPROVED_FOR_RELEASE' | 'BLOCKED_PENDING_MIGRATION';

export interface ReleaseDecision {
  decision: Exclude<DecisionStatus, 'PENDING'>;
  reason?: string;
  actorId: string;
  actorDisplayName: string;
  decidedAt: string;
  idempotencyKey: string;
}

export interface Assessment {
  id: string;
  scenarioId: string;
  analysisStatus: AnalysisStatus;
  decisionStatus: DecisionStatus;
  baselineSpecHash: string;
  candidateSpecHash: string;
  repositoryCommits: Record<string, string>;
  sourceMode: 'snapshot' | 'live';
  classifierMode: 'llm' | 'deterministic-only' | 'deterministic-fallback' | 'hybrid-with-fallback';
  /** Version of the repository scope registry when this assessment was run */
  repositoryScopeVersion: number;
  /** Linked EvidenceSnapshotV2 ID */
  evidenceSnapshotId?: string;
  /** Coverage statistics */
  repositoriesExpected?: string[];
  repositoriesChecked?: string[];
  repositoriesFailed?: string[];
  coverageRatio?: number;
  changes: ApiChange[];
  evidence: AssessedEvidence[];
  overallSeverity: 'HIGH' | 'MEDIUM' | 'LOW';
  limitations: string[];
  durationMs: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  decision?: ReleaseDecision;
}

export interface ScenarioSpecs {
  scenarioId: string;
  baseline: Record<string, unknown>;
  candidate: Record<string, unknown>;
}
