import { z } from 'zod';

export type EvidenceClassification = 'CONFIRMED_IMPACT' | 'LIKELY_IMPACT' | 'FALSE_POSITIVE' | 'REVIEW_REQUIRED';
export type EvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ModelMigrationAction {
  title: string;
  description: string;
  repository: string;
  filePath: string;
  lineNumber?: number;
  relatedChangeIds: string[];
}

export interface ModelEvidenceAssessment {
  evidenceId: string;
  classification: EvidenceClassification;
  confidence: EvidenceConfidence;
  matchedChangeIds: string[];
  reasoning: string;
  migrationActions: ModelMigrationAction[];
}

export interface AssessRiskOutput {
  assessments: ModelEvidenceAssessment[];
  limitations: string[];
}

export const EvidenceAssessmentSchema = z.object({
  evidenceId: z.string().min(1),
  classification: z.enum(['CONFIRMED_IMPACT', 'LIKELY_IMPACT', 'FALSE_POSITIVE', 'REVIEW_REQUIRED']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  matchedChangeIds: z.array(z.string()),
  reasoning: z.string().min(5).max(500),
  migrationActions: z.array(z.object({
    title: z.string().min(3).max(120), description: z.string().min(5).max(500), repository: z.string(), filePath: z.string(),
    lineNumber: z.number().int().positive().optional(), relatedChangeIds: z.array(z.string()).min(1)
  })).max(3)
});

export const AssessRiskOutputSchema = z.object({
  assessments: z.array(EvidenceAssessmentSchema),
  limitations: z.array(z.string().max(240)).max(8)
}) as { parse(input: unknown): AssessRiskOutput };

export const AssessRiskJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['assessments', 'limitations'],
  properties: {
    assessments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['evidenceId', 'classification', 'confidence', 'matchedChangeIds', 'reasoning', 'migrationActions'],
        properties: {
          evidenceId: { type: 'string', minLength: 1 },
          classification: { type: 'string', enum: ['CONFIRMED_IMPACT', 'LIKELY_IMPACT', 'FALSE_POSITIVE', 'REVIEW_REQUIRED'] },
          confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          matchedChangeIds: { type: 'array', items: { type: 'string' } },
          reasoning: { type: 'string', minLength: 5, maxLength: 500 },
          migrationActions: {
            type: 'array',
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'description', 'repository', 'filePath', 'relatedChangeIds'],
              properties: {
                title: { type: 'string', minLength: 3, maxLength: 120 },
                description: { type: 'string', minLength: 5, maxLength: 500 },
                repository: { type: 'string' },
                filePath: { type: 'string' },
                relatedChangeIds: { type: 'array', minItems: 1, items: { type: 'string' } }
              }
            }
          }
        }
      }
    },
    limitations: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 240 } }
  }
};
