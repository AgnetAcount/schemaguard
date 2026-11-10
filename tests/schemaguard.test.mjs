import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFormat,
  normalizeToUniversal,
  exportTo,
  lintTool,
  generateMock,
  validateRuntimePayload,
  generateTypeScriptTypes
} from '../dist/index.js';

test('Format Detection', async (t) => {
  await t.test('detects OpenAI tool format', () => {
    const openai = {
      type: 'function',
      function: {
        name: 'test_tool',
        description: 'Test description',
        parameters: { type: 'object', properties: {} }
      }
    };
    assert.equal(detectFormat(openai), 'openai');
  });

  await t.test('detects Anthropic tool format', () => {
    const anthropic = {
      name: 'test_tool',
      description: 'Test description',
      input_schema: { type: 'object', properties: {} }
    };
    assert.equal(detectFormat(anthropic), 'anthropic');
  });

  await t.test('detects MCP tool format', () => {
    const mcp = {
      name: 'test_tool',
      description: 'Test description',
      inputSchema: { type: 'object', properties: {} }
    };
    assert.equal(detectFormat(mcp), 'mcp');
  });

  await t.test('detects Gemini tool format', () => {
    const gemini = {
      functionDeclarations: [
        {
          name: 'test_tool',
          description: 'Test description',
          parameters: { type: 'object', properties: {} }
        }
      ]
    };
    assert.equal(detectFormat(gemini), 'gemini');
  });
});

test('Format Conversion & Normalization', async (t) => {
  const sampleOpenAI = {
    type: 'function',
    function: {
      name: 'fetch_user',
      description: 'Fetches user details by user ID from the database.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Unique user identifier' },
          includeProfile: { type: 'boolean', description: 'Include extended profile data' }
        },
        required: ['userId']
      }
    }
  };

  const universal = normalizeToUniversal(sampleOpenAI);
  assert.equal(universal.name, 'fetch_user');
  assert.equal(universal.description, 'Fetches user details by user ID from the database.');

  await t.test('converts to Anthropic format', () => {
    const anthropic = exportTo(universal, 'anthropic');
    assert.equal(anthropic.name, 'fetch_user');
    assert.ok(anthropic.input_schema);
    assert.equal(anthropic.input_schema.properties.userId.type, 'string');
  });

  await t.test('converts to MCP format', () => {
    const mcp = exportTo(universal, 'mcp');
    assert.equal(mcp.name, 'fetch_user');
    assert.ok(mcp.inputSchema);
    assert.equal(mcp.inputSchema.properties.userId.type, 'string');
  });

  await t.test('converts to OpenAI strict mode', () => {
    const strictOpenai = exportTo(universal, 'openai', { strict: true });
    assert.equal(strictOpenai.function.strict, true);
    assert.equal(strictOpenai.function.parameters.additionalProperties, false);
    assert.deepEqual(strictOpenai.function.parameters.required.sort(), ['includeProfile', 'userId']);
  });
});

test('Linter & Quality Audit', async (t) => {
  await t.test('passes high quality tool schema with score 100', () => {
    const tool = {
      name: 'query_vector_db',
      description: 'Queries vector database for semantic nearest neighbors matching the prompt query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search prompt string to embed and query' },
          topK: { type: 'integer', minimum: 1, maximum: 50, description: 'Number of top results to return' }
        },
        required: ['query']
      }
    };
    const result = lintTool(tool);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.score, 100);
  });

  await t.test('flags invalid tool names and vague descriptions', () => {
    const badTool = {
      name: 'bad tool with spaces!',
      description: 'Short',
      parameters: {
        type: 'object',
        properties: {
          flag: { type: 'boolean' } // missing description
        }
      }
    };
    const result = lintTool(badTool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'INVALID_TOOL_NAME'));
    assert.ok(result.warnings.some((w) => w.code === 'VAGUE_TOOL_DESCRIPTION'));
    assert.ok(result.warnings.some((w) => w.code === 'MISSING_PROPERTY_DESCRIPTION'));
    assert.ok(result.score < 80);
  });

  await t.test('flags array without items and unsupported $ref', () => {
    const invalidTool = {
      name: 'test_schema',
      description: 'Valid long description for this schema test case.',
      parameters: {
        type: 'object',
        properties: {
          tags: { type: 'array' }, // missing items!
          refKey: { $ref: '#/definitions/Something' } // unsupported ref!
        }
      }
    };
    const result = lintTool(invalidTool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'ARRAY_MISSING_ITEMS'));
    assert.ok(result.errors.some((e) => e.code === 'UNSUPPORTED_REF_KEYWORD'));
  });

  await t.test('flags invalid numeric bounds where min > max', () => {
    const boundsTool = {
      name: 'test_bounds',
      description: 'Valid long description for testing numeric bounds.',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'integer', minimum: 100, maximum: 10, description: 'Broken range' }
        }
      }
    };
    const result = lintTool(boundsTool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'INVALID_NUMERIC_BOUNDS'));
  });
});

test('Synthetic Mock Generator', async (t) => {
  const tool = {
    name: 'send_email_notification',
    description: 'Sends email notification to users.',
    parameters: {
      type: 'object',
      properties: {
        recipientEmail: { type: 'string', format: 'email', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject title' },
        priority: { type: 'string', enum: ['low', 'normal', 'urgent'], description: 'Urgency priority' },
        retryCount: { type: 'integer', minimum: 0, maximum: 5, default: 3, description: 'Max retry attempts' },
        metadata: {
          type: 'object',
          properties: {
            campaignId: { type: 'string', description: 'Marketing campaign ID' }
          }
        }
      },
      required: ['recipientEmail', 'subject']
    }
  };

  await t.test('generates happy path payload', () => {
    const mock = generateMock(tool, { mode: 'happy' });
    assert.equal(mock.recipientEmail, 'user@example.com');
    assert.equal(typeof mock.subject, 'string');
    assert.equal(mock.priority, 'low');
    assert.equal(mock.retryCount, 3);
    assert.ok(mock.metadata);
  });

  await t.test('generates minimal payload with required fields only', () => {
    const minimal = generateMock(tool, { mode: 'minimal' });
    assert.ok(minimal.recipientEmail);
    assert.ok(minimal.subject);
    assert.equal(minimal.priority, undefined);
    assert.equal(minimal.retryCount, undefined);
    assert.equal(minimal.metadata, undefined);
  });

  await t.test('generates edge payload testing bounds', () => {
    const edge = generateMock(tool, { mode: 'edge' });
    assert.equal(edge.priority, 'urgent'); // last enum item
    assert.equal(edge.retryCount, 0); // minimum bound
  });
});

test('Microsecond Runtime Payload Validator', async (t) => {
  const tool = {
    name: 'create_issue',
    description: 'Creates a project issue.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 5, maxLength: 50 },
        severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
        estimateHours: { type: 'integer', minimum: 1, maximum: 40 }
      },
      required: ['title', 'severity'],
      additionalProperties: false
    }
  };

  await t.test('validates valid runtime payload', () => {
    const payload = {
      title: 'Fix memory leak in buffer scanner',
      severity: 'P1',
      estimateHours: 8
    };
    const res = validateRuntimePayload(tool, payload);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  await t.test('rejects missing required field', () => {
    const payload = {
      title: 'Valid title'
      // missing severity
    };
    const res = validateRuntimePayload(tool, payload);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.message.includes('Missing required property "severity"')));
  });

  await t.test('rejects invalid enum member', () => {
    const payload = {
      title: 'Valid title',
      severity: 'P99'
    };
    const res = validateRuntimePayload(tool, payload);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.message.includes('not an allowed enum member')));
  });

  await t.test('rejects number out of bounds and string too short', () => {
    const payload = {
      title: 'Abc', // minLength 5
      severity: 'P0',
      estimateHours: 100 // max 40
    };
    const res = validateRuntimePayload(tool, payload);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.message.includes('shorter than minLength')));
    assert.ok(res.errors.some((e) => e.message.includes('greater than maximum')));
  });

  await t.test('rejects unexpected properties when additionalProperties is false', () => {
    const payload = {
      title: 'Valid title here',
      severity: 'P2',
      hallucinatedField: 'dangerous LLM output'
    };
    const res = validateRuntimePayload(tool, payload);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.message.includes('Unexpected property "hallucinatedField"')));
  });
});

test('TypeScript Type Generator', async (t) => {
  const tool = {
    name: 'search_database',
    description: 'Searches database records matching query filter.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text query' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Max items count' },
        sort: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order' }
      },
      required: ['query']
    }
  };

  const tsCode = generateTypeScriptTypes(tool, { interfaceName: 'SearchDatabaseParams' });
  assert.ok(tsCode.includes('export interface SearchDatabaseParams {'));
  assert.ok(tsCode.includes('query: string;'));
  assert.ok(tsCode.includes('limit?: number;'));
  assert.ok(tsCode.includes('sort?: "asc" | "desc";'));
  assert.ok(tsCode.includes('* Search text query'));
});
