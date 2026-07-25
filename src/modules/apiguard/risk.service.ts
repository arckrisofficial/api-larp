import { Injectable } from '@nitrostack/core';
import { computeSeverity, deterministicClassify, fallbackAssess } from '../../domain/deterministic-risk.js';
import type { ApiChange, AssessedEvidence, EvidenceItem, MigrationAction } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';
import { ModelGateway } from './model.gateway.js';
import { RISK_SYSTEM_PROMPT, riskUserPrompt } from './risk.prompt.js';
import { AssessRiskJsonSchema, AssessRiskOutputSchema, type AssessRiskOutput } from './risk.schemas.js';

export interface RiskAssessmentResult {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  classifierMode: 'llm' | 'deterministic-only' | 'deterministic-fallback' | 'hybrid-with-fallback';
  modelProvider?: 'openai' | 'anthropic' | 'gemini';
  modelName?: string;
  evidence: AssessedEvidence[];
  limitations: string[];
}

@Injectable({ deps: [ApiGuardConfig, ModelGateway] })
export class RiskService {
  constructor(
    private readonly config: ApiGuardConfig,
    private readonly modelGateway: ModelGateway
  ) {}

  async assess(changes: ApiChange[], evidence: EvidenceItem[]): Promise<RiskAssessmentResult> {
    const limitations: string[] = [];
    if (!evidence.length) {
      return {
        severity: changes.some((change) => change.breaking) ? 'MEDIUM' : 'LOW',
        classifierMode: 'deterministic-fallback',
        evidence: [],
        limitations: [
          changes.some((change) => change.breaking)
            ? 'Breaking contract changes exist, but no consumer evidence was available. Impact requires manual review.'
            : 'No consumer code evidence items were provided for risk assessment.'
        ]
      };
    }

    const deterministic = new Map<string, AssessedEvidence>();
    const ambiguous: EvidenceItem[] = [];
    for (const item of evidence) {
      const classified = deterministicClassify(item, changes);
      if (classified) deterministic.set(item.id, classified);
      else ambiguous.push(item);
    }

    if (!this.config.useLlm || ambiguous.length === 0) {
      if (!this.config.useLlm && ambiguous.length > 0) {
        limitations.push('LLM classification is disabled; deterministic fallback was used for ambiguous evidence.');
      }
      const output = evidence.map((item) => deterministic.get(item.id) ?? fallbackAssess(item, changes));
      return {
        severity: computeSeverity(output),
        classifierMode: ambiguous.length > 0 ? 'deterministic-fallback' : 'deterministic-only',
        evidence: output,
        limitations
      };
    }

    const capped = ambiguous.slice(0, this.config.maxEvidenceItems);
    if (ambiguous.length > capped.length) {
      limitations.push(`Ambiguous evidence capped to ${capped.length} items out of ${ambiguous.length}; remaining items require review.`);
    }

    try {
      const generated = await this.modelGateway.generateStructured({
        taskName: 'apiguard_risk_assessment',
        systemPrompt: RISK_SYSTEM_PROMPT,
        userPrompt: riskUserPrompt(changes, capped),
        jsonSchema: AssessRiskJsonSchema,
        validate: (value) => AssessRiskOutputSchema.parse(value),
        maxOutputTokens: 2200
      });
      const reconciled = this.reconcile(changes, evidence, deterministic, capped, generated.output);
      return {
        severity: computeSeverity(reconciled.evidence),
        classifierMode: reconciled.hadFallback ? 'hybrid-with-fallback' : 'llm',
        modelProvider: generated.provider,
        modelName: generated.model,
        evidence: reconciled.evidence,
        limitations: [...limitations, ...generated.output.limitations]
      };
    } catch (error) {
      const message = sanitizeError(error);
      limitations.push(`The bounded LLM classifier was unavailable: ${message}`);
      const output = evidence.map((item) => deterministic.get(item.id) ?? fallbackAssess(item, changes));
      return {
        severity: computeSeverity(output),
        classifierMode: 'deterministic-fallback',
        evidence: output,
        limitations
      };
    }
  }

  private reconcile(
    changes: ApiChange[],
    allEvidence: EvidenceItem[],
    deterministic: Map<string, AssessedEvidence>,
    sentToModel: EvidenceItem[],
    output: AssessRiskOutput
  ): { evidence: AssessedEvidence[]; hadFallback: boolean } {
    const sentIds = new Set(sentToModel.map((item) => item.id));
    const modelMap = new Map(output.assessments.map((assessment) => [assessment.evidenceId, assessment]));
    let hadFallback = false;

    const evidence = allEvidence.map((item): AssessedEvidence => {
      const deterministicResult = deterministic.get(item.id);
      if (deterministicResult) return deterministicResult;

      if (!sentIds.has(item.id)) {
        hadFallback = true;
        return fallbackAssess(item, changes);
      }

      const modelAssessment = modelMap.get(item.id);
      if (!modelAssessment) {
        hadFallback = true;
        return fallbackAssess(item, changes);
      }

      const validChangeIds = new Set(item.generatedFromChangeIds);
      const matchedChangeIds = modelAssessment.matchedChangeIds.filter((id) => validChangeIds.has(id));
      const migrationActions: MigrationAction[] = modelAssessment.migrationActions
        .filter((action) => action.repository === item.repository && action.filePath === item.filePath)
        .map((action) => ({
          title: action.title,
          description: action.description,
          repository: item.repository,
          filePath: item.filePath,
          lineNumber: action.lineNumber,
          relatedChangeIds: action.relatedChangeIds.filter((id) => validChangeIds.has(id))
        }))
        .filter((action) => action.relatedChangeIds.length > 0);

      const claimsImpact = modelAssessment.classification === 'CONFIRMED_IMPACT' || modelAssessment.classification === 'LIKELY_IMPACT';
      if (claimsImpact && matchedChangeIds.length === 0) {
        hadFallback = true;
        return {
          ...item,
          classification: 'REVIEW_REQUIRED',
          confidence: 'LOW',
          matchedChangeIds: [],
          reasoning: 'The model claimed impact without a valid deterministic contract-change link. Manual review is required.',
          migrationActions: []
        };
      }

      return {
        ...item,
        classification: modelAssessment.classification,
        confidence: modelAssessment.confidence,
        matchedChangeIds,
        reasoning: modelAssessment.reasoning,
        migrationActions
      };
    });

    return { evidence, hadFallback };
  }
}

function sanitizeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer ***')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .slice(0, 220);
}
