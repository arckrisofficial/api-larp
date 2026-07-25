export type FixPlanStatus = 'DRAFT' | 'PUBLISHED' | 'PARTIALLY_PUBLISHED' | 'FAILED';

export interface FixPlanFile {
  repository: string;
  branch: string;
  baseCommitSha: string;
  filePath: string;
  originalContentHash: string;
  proposedContent: string;
  summary: string;
  relatedEvidenceIds: string[];
  relatedChangeIds: string[];
}

export interface CreatedPullRequest {
  repository: string;
  branch: string;
  baseBranch: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  commitSha: string;
  draft: boolean;
}

export interface FixPlan {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  status: FixPlanStatus;
  providerMode: 'llm' | 'deterministic-fixture';
  modelProvider?: 'openai' | 'anthropic' | 'gemini';
  modelName?: string;
  files: FixPlanFile[];
  limitations: string[];
  createdPullRequests: CreatedPullRequest[];
  createdAt: string;
  updatedAt: string;
  version: number;
}
