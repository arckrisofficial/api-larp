import { Injectable } from '@nitrostack/core';
import { ApiGuardConfig } from './config.service.js';

export type ModelProvider = 'openai' | 'anthropic' | 'gemini';

export interface StructuredModelRequest<T> {
  taskName: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  validate: (input: unknown) => T;
  maxOutputTokens?: number;
}

export interface StructuredModelResult<T> {
  provider: ModelProvider;
  model: string;
  output: T;
}

@Injectable({ deps: [ApiGuardConfig] })
export class ModelGateway {
  constructor(private readonly config: ApiGuardConfig) {}

  async generateStructured<T>(request: StructuredModelRequest<T>): Promise<StructuredModelResult<T>> {
    const provider = this.config.llmProvider;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.llmTimeoutMs);

    try {
      const raw = provider === 'anthropic'
        ? await this.callAnthropic(request, controller.signal)
        : provider === 'gemini'
          ? await this.callGemini(request, controller.signal)
          : await this.callOpenAi(request, controller.signal);

      return {
        provider,
        model: this.modelName(provider),
        output: request.validate(raw)
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private modelName(provider: ModelProvider): string {
    if (provider === 'anthropic') return this.config.anthropicModel;
    if (provider === 'gemini') return this.config.geminiModel;
    return this.config.openAiModel;
  }

  private async callOpenAi<T>(request: StructuredModelRequest<T>, signal: AbortSignal): Promise<unknown> {
    if (!this.config.openAiKey) throw new Error('OPENAI_API_KEY is missing.');
    const response = await fetch(`${this.config.openAiBaseUrl}/responses`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${this.config.openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.openAiModel,
        instructions: request.systemPrompt,
        input: request.userPrompt,
        store: false,
        max_output_tokens: request.maxOutputTokens ?? 2200,
        text: {
          format: {
            type: 'json_schema',
            name: safeSchemaName(request.taskName),
            strict: true,
            schema: request.jsonSchema
          }
        }
      })
    });

    if (!response.ok) throw await providerError('OpenAI', response);
    const payload = await response.json() as Record<string, unknown>;
    const text = extractOpenAiText(payload);
    return parseJsonText('OpenAI', text);
  }

  private async callAnthropic<T>(request: StructuredModelRequest<T>, signal: AbortSignal): Promise<unknown> {
    if (!this.config.anthropicKey) throw new Error('ANTHROPIC_API_KEY is missing.');
    const toolName = `emit_${safeSchemaName(request.taskName)}`.slice(0, 64);
    const response = await fetch(`${this.config.anthropicBaseUrl}/v1/messages`, {
      method: 'POST',
      signal,
      headers: {
        'x-api-key': this.config.anthropicKey,
        'anthropic-version': this.config.anthropicApiVersion,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.anthropicModel,
        max_tokens: request.maxOutputTokens ?? 2200,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
        tools: [{
          name: toolName,
          description: 'Return the final structured result. Do not call any other tool.',
          input_schema: request.jsonSchema
        }],
        tool_choice: { type: 'tool', name: toolName }
      })
    });

    if (!response.ok) throw await providerError('Anthropic', response);
    const payload = await response.json() as Record<string, unknown>;
    const content = Array.isArray(payload.content) ? payload.content : [];
    const toolUse = content.find((item) => isRecord(item) && item.type === 'tool_use' && item.name === toolName);
    if (!isRecord(toolUse) || !('input' in toolUse)) {
      throw new Error('Anthropic response did not contain the required structured tool result.');
    }
    return toolUse.input;
  }

  private async callGemini<T>(request: StructuredModelRequest<T>, signal: AbortSignal): Promise<unknown> {
    if (!this.config.geminiKey) throw new Error('GEMINI_API_KEY is missing.');
    const response = await fetch(`${this.config.geminiBaseUrl}/v1beta/interactions`, {
      method: 'POST',
      signal,
      headers: {
        'x-goog-api-key': this.config.geminiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.geminiModel,
        system_instruction: request.systemPrompt,
        input: request.userPrompt,
        store: false,
        generation_config: {
          max_output_tokens: request.maxOutputTokens ?? 2200
        },
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: request.jsonSchema
        }
      })
    });

    if (!response.ok) throw await providerError('Gemini', response);
    const payload = await response.json() as Record<string, unknown>;
    const text = extractGeminiText(payload);
    return parseJsonText('Gemini', text);
  }
}

function safeSchemaName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'structured_result';
}

function parseJsonText(provider: string, text: string): unknown {
  try {
    return JSON.parse(stripCodeFence(text));
  } catch (error) {
    throw new Error(`${provider} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function extractOpenAiText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('OpenAI response contained no structured output text.');
}

function extractGeminiText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  for (const step of steps) {
    if (!isRecord(step) || !Array.isArray(step.content)) continue;
    for (const content of step.content) {
      if (isRecord(content) && typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('Gemini response contained no structured output text.');
}

async function providerError(provider: string, response: Response): Promise<Error> {
  const body = (await response.text()).replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer ***').slice(0, 500);
  return new Error(`${provider} ${response.status}: ${body}`);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
