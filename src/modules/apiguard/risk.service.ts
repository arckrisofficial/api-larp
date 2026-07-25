import { Injectable } from '@nitrostack/core';
import { computeSeverity, deterministicClassify, fallbackAssess } from '../../domain/deterministic-risk.js';
import type { ApiChange, AssessedEvidence, EvidenceItem } from '../../domain/types.js';
import { ApiGuardConfig } from './config.service.js';
import { RISK_SYSTEM_PROMPT, riskUserPrompt } from './risk.prompt.js';
import { AssessRiskOutputSchema } from './risk.schemas.js';

@Injectable({ deps: [ApiGuardConfig] })
export class RiskService {
  constructor(private readonly config: ApiGuardConfig) {}

  async assess(changes: ApiChange[], evidence: EvidenceItem[]): Promise<{ evidence: AssessedEvidence[]; severity: 'HIGH' | 'MEDIUM' | 'LOW'; limitations: string[]; classifierMode: 'llm' | 'deterministic-fallback' }> {
    const assessed: AssessedEvidence[] = [];
    const ambiguous: EvidenceItem[] = [];
    for (const item of evidence) {
      const deterministic = deterministicClassify(item, changes);
      deterministic ? assessed.push(deterministic) : ambiguous.push(item);
    }
    let limitations: string[] = [];
    let classifierMode: 'llm' | 'deterministic-fallback' = 'deterministic-fallback';
    if (this.config.useLlm && ambiguous.length) {
      try {
        const modelResult = await this.callModel(changes, ambiguous.slice(0, this.config.maxEvidenceItems));
        const allowedChanges = new Set(changes.map((change) => change.id));
        const byId = new Map(modelResult.assessments.map((item) => [item.evidenceId, item]));
        for (const item of ambiguous) {
          const model = byId.get(item.id);
          if (!model || model.matchedChangeIds.some((id) => !allowedChanges.has(id))) assessed.push(fallbackAssess(item, changes));
          else assessed.push({ ...item, ...model });
        }
        limitations = modelResult.limitations;
        classifierMode = 'llm';
      } catch (error) {
        limitations.push(`The bounded LLM classifier was unavailable: ${error instanceof Error ? error.message : String(error)}`);
        assessed.push(...ambiguous.map((item) => fallbackAssess(item, changes)));
      }
    } else {
      assessed.push(...ambiguous.map((item) => fallbackAssess(item, changes)));
      if (ambiguous.length) limitations.push('LLM classification is disabled; deterministic fallback was used for ambiguous evidence.');
    }
    return { evidence: assessed.sort((a, b) => a.repository.localeCompare(b.repository) || a.filePath.localeCompare(b.filePath)), severity: computeSeverity(assessed), limitations, classifierMode };
  }

  private async callModel(changes: ApiChange[], evidence: EvidenceItem[]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.llmTimeoutMs);
    try {
      const raw =
        this.config.llmProvider === 'anthropic' ? await this.callAnthropic(changes, evidence, controller.signal) :
        this.config.llmProvider === 'gemini'    ? await this.callGemini(changes, evidence, controller.signal) :
                                                  await this.callOpenAi(changes, evidence, controller.signal);
      const parsed = JSON.parse(raw) as unknown;
      return AssessRiskOutputSchema.parse(parsed);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOpenAi(changes: ApiChange[], evidence: EvidenceItem[], signal: AbortSignal): Promise<string> {
    if (!this.config.openAiKey) throw new Error('OPENAI_API_KEY is missing.');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${this.config.openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.config.openAiModel, temperature: 0, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: RISK_SYSTEM_PROMPT }, { role: 'user', content: riskUserPrompt(changes, evidence) }
      ] })
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    const payload = await response.json() as any;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('OpenAI response contained no JSON text.');
    return content;
  }

  private async callAnthropic(changes: ApiChange[], evidence: EvidenceItem[], signal: AbortSignal): Promise<string> {
    if (!this.config.anthropicKey) throw new Error('ANTHROPIC_API_KEY is missing.');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'x-api-key': this.config.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.config.anthropicModel, max_tokens: 1800, temperature: 0, system: RISK_SYSTEM_PROMPT, messages: [{ role: 'user', content: riskUserPrompt(changes, evidence) }] })
    });
    if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
    const payload = await response.json() as any;
    const content = payload.content?.find((item: any) => item.type === 'text')?.text;
    if (typeof content !== 'string') throw new Error('Anthropic response contained no JSON text.');
    return content;
  }

  private async callGemini(changes: ApiChange[], evidence: EvidenceItem[], signal: AbortSignal): Promise<string> {
    if (!this.config.geminiKey) throw new Error('GEMINI_API_KEY is missing.');
    const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
    const response = await fetch(url, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${this.config.geminiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.geminiModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: RISK_SYSTEM_PROMPT },
          { role: 'user', content: riskUserPrompt(changes, evidence) }
        ]
      })
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    const payload = await response.json() as any;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Gemini response contained no JSON text.');
    return content;
  }
}
