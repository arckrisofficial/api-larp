import test from 'node:test';
import assert from 'node:assert/strict';
import { diffOpenApi } from '../../src/domain/openapi-diff.js';

const baseline = {
  openapi: '3.0.3',
  paths: {
    '/u': {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'name', 'status'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive'] }
        }
      }
    }
  }
};

const candidate = {
  openapi: '3.0.3',
  paths: {
    '/u': {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'status'],
        properties: {
          id: { type: 'string' },
          fullName: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'suspended'] }
        }
      }
    }
  }
};

test('semantic OpenAPI subset detects removal, type change, response enum widening and safe addition', () => {
  const changes = diffOpenApi(baseline as any, candidate as any);
  assert.ok(changes.some((change) => change.code === 'REQUIRED_PROPERTY_REMOVED' && change.jsonPath === '$response.name' && change.breaking));
  assert.ok(changes.some((change) => change.code === 'PROPERTY_TYPE_CHANGED' && change.jsonPath === '$response.id' && change.breaking));
  assert.ok(changes.some((change) => change.code === 'ENUM_WIDENED' && change.jsonPath === '$response.status' && change.breaking));
  assert.ok(changes.some((change) => change.code === 'OPTIONAL_PROPERTY_ADDED' && change.jsonPath === '$response.fullName' && !change.breaking));
});

test('request enum narrowing is breaking while response enum narrowing is not', () => {
  const oldDoc = {
    openapi: '3.0.3',
    paths: {
      '/u': {
        post: {
          requestBody: { content: { 'application/json': { schema: { type: 'string', enum: ['a', 'b'] } } } },
          responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'string', enum: ['a', 'b'] } } } } }
        }
      }
    }
  };
  const newDoc = {
    openapi: '3.0.3',
    paths: {
      '/u': {
        post: {
          requestBody: { content: { 'application/json': { schema: { type: 'string', enum: ['a'] } } } },
          responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'string', enum: ['a'] } } } } }
        }
      }
    }
  };
  const changes = diffOpenApi(oldDoc as any, newDoc as any);
  assert.ok(changes.some((change) => change.code === 'ENUM_NARROWED' && change.location === 'request' && change.breaking));
  assert.ok(changes.some((change) => change.code === 'ENUM_NARROWED' && change.location === 'response' && !change.breaking));
});

test('recursive local schema references fail safely instead of overflowing the stack', () => {
  const recursive = {
    openapi: '3.0.3',
    paths: {
      '/nodes': {
        get: {
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        Node: {
          type: 'object',
          properties: { child: { $ref: '#/components/schemas/Node' } }
        }
      }
    }
  };
  assert.throws(() => diffOpenApi(recursive as any, recursive as any), /Recursive reference is outside the MVP subset/);
});

test('parameter schema changes are compared semantically', () => {
  const oldDoc = {
    openapi: '3.0.3',
    paths: {
      '/users': {
        get: {
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', enum: [10, 20, 50] }
            }
          ],
          responses: { '200': { description: 'ok' } }
        }
      }
    }
  };
  const newDoc = {
    openapi: '3.0.3',
    paths: {
      '/users': {
        get: {
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['10', '20'] }
            }
          ],
          responses: { '200': { description: 'ok' } }
        }
      }
    }
  };

  const changes = diffOpenApi(oldDoc as any, newDoc as any);
  assert.ok(changes.some((change) =>
    change.code === 'PROPERTY_TYPE_CHANGED'
    && change.location === 'query'
    && change.jsonPath === '$parameter.query.limit'
    && change.breaking
  ));
});

test('new required parameters and request bodies are reported as breaking', () => {
  const oldDoc = {
    openapi: '3.0.3',
    paths: {
      '/users': {
        post: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } } } }
      }
    }
  };
  const newDoc = {
    openapi: '3.0.3',
    paths: {
      '/users': {
        post: {
          parameters: [{ name: 'tenant', in: 'header', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } }
          },
          responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } } }
        }
      }
    }
  };
  const changes = diffOpenApi(oldDoc as any, newDoc as any);
  assert.ok(changes.some((change) => change.code === 'PARAMETER_BECAME_REQUIRED' && change.jsonPath === 'header.tenant' && change.breaking));
  assert.ok(changes.some((change) => change.code === 'REQUEST_BODY_BECAME_REQUIRED' && change.breaking));
});

test('removing the declared success response schema is breaking', () => {
  const oldDoc = {
    openapi: '3.0.3',
    paths: { '/users': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } } } } } } }
  };
  const newDoc = {
    openapi: '3.0.3',
    paths: { '/users': { get: { responses: { '204': { description: 'no content' } } } } }
  };
  const changes = diffOpenApi(oldDoc as any, newDoc as any);
  assert.ok(changes.some((change) => change.code === 'RESPONSE_SCHEMA_REMOVED' && change.breaking));
});

test('response required-to-optional is breaking while request required-to-optional is non-breaking', () => {
  const oldDoc = {
    openapi: '3.0.3',
    paths: {
      '/users': {
        post: {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' } }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['name'],
                    properties: { name: { type: 'string' } }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  const newDoc = {
    openapi: '3.0.3',
    paths: {
      '/users': {
        post: {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string' } }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { name: { type: 'string' } }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  const changes = diffOpenApi(oldDoc as any, newDoc as any);
  assert.ok(changes.some((change) =>
    change.code === 'REQUIRED_PROPERTY_BECAME_OPTIONAL'
    && change.location === 'response'
    && change.jsonPath === '$response.name'
    && change.breaking
  ));
  assert.ok(changes.some((change) =>
    change.code === 'REQUIRED_PROPERTY_BECAME_OPTIONAL'
    && change.location === 'request'
    && change.jsonPath === '$request.name'
    && !change.breaking
  ));
});

test('unsupported polymorphic schemas fail closed with an explicit manual-review change', () => {
  const oldDoc = {
    openapi: '3.0.3',
    paths: {
      '/users': {
        get: {
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { type: 'object', properties: { id: { type: 'string' } } },
                      { type: 'object', properties: { error: { type: 'string' } } }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
  };
  const newDoc = structuredClone(oldDoc);
  const changes = diffOpenApi(oldDoc as any, newDoc as any);
  assert.ok(changes.some((change) =>
    change.code === 'UNSUPPORTED_CHANGE'
    && change.location === 'response'
    && change.breaking
    && /oneOf/.test(change.rationale)
  ));
});
