import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiGuardConfig } from '../../src/modules/apiguard/config.service.js';
import { ModelGateway } from '../../src/modules/apiguard/model.gateway.js';

const schema = {
  type: 'object', additionalProperties: false, required: ['ok'],
  properties: { ok: { type: 'boolean' } }
};

test('ModelGateway supports OpenAI, Anthropic, and Gemini structured output protocols', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  try {
    for (const provider of ['openai', 'anthropic', 'gemini'] as const) {
      process.env.LLM_PROVIDER = provider;
      process.env.OPENAI_API_KEY = 'test-openai';
      process.env.ANTHROPIC_API_KEY = 'test-anthropic';
      process.env.GEMINI_API_KEY = 'test-gemini';
      let requestedUrl = '';
      let requestedBody: any;
      globalThis.fetch = (async (input: any, init?: any) => {
        requestedUrl = String(input);
        requestedBody = JSON.parse(String(init?.body ?? '{}'));
        if (provider === 'openai') return new Response(JSON.stringify({ output_text: '{"ok":true}' }), { status: 200 });
        if (provider === 'anthropic') {
          const toolName = requestedBody.tools[0].name;
          return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: toolName, input: { ok: true } }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ output_text: '{"ok":true}' }), { status: 200 });
      }) as typeof fetch;

      const gateway = new ModelGateway(new ApiGuardConfig());
      const result = await gateway.generateStructured({
        taskName: 'test_output', systemPrompt: 'Return JSON.', userPrompt: 'Do it.', jsonSchema: schema,
        validate: (value) => value as { ok: boolean }
      });
      assert.equal(result.provider, provider);
      assert.equal(result.output.ok, true);
      if (provider === 'openai') {
        assert.match(requestedUrl, /\/v1\/responses$/);
        assert.equal(requestedBody.text.format.type, 'json_schema');
        assert.equal(requestedBody.store, false);
        assert.equal(requestedBody.max_output_tokens, 2200);
      } else if (provider === 'anthropic') {
        assert.match(requestedUrl, /\/v1\/messages$/);
        assert.equal(requestedBody.tool_choice.type, 'tool');
        assert.equal('temperature' in requestedBody, false);
      } else {
        assert.match(requestedUrl, /\/v1beta\/interactions$/);
        assert.equal(requestedBody.response_format.mime_type, 'application/json');
        assert.equal(requestedBody.system_instruction, 'Return JSON.');
        assert.equal(requestedBody.store, false);
        assert.equal(requestedBody.generation_config.max_output_tokens, 2200);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
