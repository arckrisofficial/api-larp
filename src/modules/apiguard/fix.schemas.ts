import { z } from 'zod';

export interface ModelFixFile {
  repository: string;
  filePath: string;
  proposedContent: string;
  summary: string;
  relatedEvidenceIds: string[];
  relatedChangeIds: string[];
}

export interface ModelFixPlanOutput {
  files: ModelFixFile[];
  limitations: string[];
}

export const ModelFixPlanOutputSchema = z.object({
  files: z.array(z.object({
    repository: z.string().min(1),
    filePath: z.string().min(1),
    proposedContent: z.string().min(1),
    summary: z.string().min(5).max(500),
    relatedEvidenceIds: z.array(z.string()).min(1),
    relatedChangeIds: z.array(z.string()).min(1)
  })).max(12),
  limitations: z.array(z.string().max(240)).max(8)
}) as { parse(input: unknown): ModelFixPlanOutput };

export const ModelFixPlanJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['files', 'limitations'],
  properties: {
    files: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['repository', 'filePath', 'proposedContent', 'summary', 'relatedEvidenceIds', 'relatedChangeIds'],
        properties: {
          repository: { type: 'string', minLength: 1 },
          filePath: { type: 'string', minLength: 1 },
          proposedContent: { type: 'string', minLength: 1 },
          summary: { type: 'string', minLength: 5, maxLength: 500 },
          relatedEvidenceIds: { type: 'array', minItems: 1, items: { type: 'string' } },
          relatedChangeIds: { type: 'array', minItems: 1, items: { type: 'string' } }
        }
      }
    },
    limitations: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 240 } }
  }
};
