/**
 * schemaguard — Independent Tool Schema Fuzzing & Drift Benchmark (v0.2.0)
 * Agnet Software Corp.
 *
 * Benchmark Suite:
 * - 20 Real / Fuzzed / Adversarial AI Tool Schemas
 * - Google Structured Outputs & Gemini Tool Definitions
 * - Anthropic Claude Tool Calling & Computer Use
 * - OpenAI Strict Structured Outputs
 * - Model Context Protocol (MCP) Tools (Compliant & Adversarial)
 * - Circular Reference Prevention (Direct & Indirect)
 * - Deeply Nested Properties (12+ levels)
 * - Prototype Pollution Resistance
 * - Synthetic Mock Argument Generation (Edge Cases & Boundaries)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lintTool,
  detectFormat,
  normalizeToUniversal,
  exportTo,
  generateMock,
  validateRuntimePayload,
  findCircularPath,
  detectCircularReferences
} from '../dist/index.js';

// ============================================================================
// 20 BENCHMARK SCHEMAS
// ============================================================================

const BENCHMARK_SCHEMAS = {
  // 1. Google Gemini Search Grounding
  gemini_search_grounding: {
    functionDeclarations: [
      {
        name: 'google_search_grounding',
        description: 'Performs semantic web queries against Google search index to ground model responses with authoritative references.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Primary search query expression' },
            filters: {
              type: 'array',
              items: { type: 'string' },
              description: 'Domain and date range filters'
            },
            maxResults: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum search snippets to retrieve' }
          },
          required: ['query']
        }
      }
    ]
  },

  // 2. Google Gemini Code Execution
  gemini_code_execution: {
    functionDeclarations: [
      {
        name: 'execute_sandboxed_code',
        description: 'Executes untrusted user code inside an isolated container with deterministic execution constraints.',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Executable script source code' },
            runtime: { type: 'string', enum: ['python3', 'nodejs20', 'rust'], description: 'Execution runtime environment' },
            timeoutSeconds: { type: 'integer', minimum: 1, maximum: 60, description: 'Max runtime wall-clock timeout' }
          },
          required: ['code', 'runtime']
        }
      }
    ]
  },

  // 3. Anthropic Claude Artifacts Patch
  claude_artifacts_patch: {
    name: 'patch_workspace_artifact',
    description: 'Applies unified diff patches to text or code files in the active user workspace session.',
    input_schema: {
      type: 'object',
      properties: {
        targetFile: { type: 'string', description: 'Relative path of file to patch' },
        patchLines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['add', 'modify', 'remove'], description: 'Diff operation type' },
              line: { type: 'integer', minimum: 1, description: 'One-based line index' },
              content: { type: 'string', description: 'Replacement or inserted line content' }
            },
            required: ['action', 'line']
          },
          description: 'Ordered sequence of patch instructions'
        }
      },
      required: ['targetFile', 'patchLines']
    }
  },

  // 4. Anthropic Claude Computer Use
  claude_computer_use: {
    name: 'computer_gui_action',
    description: 'Dispatches operating system GUI mouse and keyboard events to interact with desktop applications.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['mouse_move', 'left_click', 'right_click', 'key_press', 'screenshot'],
          description: 'Type of desktop input action to execute'
        },
        coordinate: {
          type: 'array',
          items: { type: 'integer', minimum: 0, maximum: 3840 },
          minItems: 2,
          maxItems: 2,
          description: 'Cartesian pixel coordinates [x, y]'
        },
        keySequence: { type: 'string', description: 'Keystroke text or modifier combo' }
      },
      required: ['action']
    }
  },

  // 5. OpenAI Structured SQL (Strict Mode)
  openai_structured_sql: {
    type: 'function',
    function: {
      name: 'query_relational_database',
      description: 'Executes structured read-only relational SQL queries against the analytical warehouse.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'Standard ANSI SQL select query' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Row cap limit' },
          readOnly: { type: 'boolean', description: 'Enforce read-only transaction state' }
        },
        required: ['sql', 'limit', 'readOnly'],
        additionalProperties: false
      }
    }
  },

  // 6. OpenAI Financial Ledger Extractor
  openai_financial_extractor: {
    type: 'function',
    function: {
      name: 'extract_invoice_ledger',
      description: 'Parses unstructured invoice documents into validated financial transactions and balance line items.',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Unique invoice identifier' },
          totalAmount: { type: 'number', minimum: 0, description: 'Grand total invoice amount' },
          currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'JPY'], description: 'ISO currency symbol' },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Itemized description of service or good' },
                quantity: { type: 'integer', minimum: 1, description: 'Number of units purchased' },
                unitPrice: { type: 'number', minimum: 0, description: 'Unit cost before tax' }
              },
              required: ['description', 'quantity', 'unitPrice']
            },
            description: 'Itemized billing records'
          }
        },
        required: ['invoiceId', 'totalAmount', 'currency', 'lineItems']
      }
    }
  },

  // 7. MCP FileSystem Read (Compliant)
  mcp_filesystem_read: {
    name: 'read_filesystem_resource',
    description: 'Reads the complete UTF-8 contents of a file at the specified absolute filesystem URI according to MCP conventions.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', format: 'uri', description: 'Absolute file:// URI destination' },
        byteOffset: { type: 'integer', minimum: 0, default: 0, description: 'Zero-based starting byte offset' },
        byteLimit: { type: 'integer', minimum: 1, maximum: 1048576, description: 'Maximum bytes to read' }
      },
      required: ['uri']
    }
  },

  // 8. MCP Knowledge Graph Search (Compliant)
  mcp_knowledge_graph: {
    name: 'search_knowledge_graph',
    description: 'Traverses knowledge graph nodes and relations matching semantic entity concepts and relationship filters.',
    inputSchema: {
      type: 'object',
      properties: {
        entityName: { type: 'string', description: 'Target entity query name' },
        relationType: { type: 'string', enum: ['depends_on', 'owns', 'subclass_of', 'references'], description: 'Edge relationship' },
        depth: { type: 'integer', minimum: 1, maximum: 5, default: 2, description: 'Graph traversal hops' }
      },
      required: ['entityName']
    }
  },

  // 9. Adversarial MCP: Invalid Tool Name with Spaces and Punctuation
  mcp_invalid_name_spaces: {
    name: 'query user data by email address!',
    description: 'Attempts to run query with non-standard MCP identifier containing spaces and exclamation point.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'User email' }
      },
      required: ['email']
    }
  },

  // 10. Adversarial MCP: Name Exceeding 64 Characters
  mcp_invalid_name_too_long: {
    name: 'this_tool_identifier_is_far_too_long_and_exceeds_the_standard_mcp_sixty_four_character_threshold_limit',
    description: 'Tool definition with identifier string far exceeding the 64-character naming specification.',
    inputSchema: {
      type: 'object',
      properties: {
        flag: { type: 'boolean', description: 'Test flag' }
      }
    }
  },

  // 11. Adversarial MCP: inputSchema type is 'string' instead of 'object'
  mcp_invalid_input_schema_type: {
    name: 'mcp_scalar_input_tool',
    description: 'Illegal MCP tool declaring a scalar string inputSchema instead of standard object.',
    inputSchema: {
      type: 'string',
      description: 'Raw string scalar input not wrapped in object'
    }
  },

  // 12. Adversarial MCP: Missing inputSchema definition
  mcp_missing_input_schema: {
    name: 'mcp_orphan_tool',
    description: 'MCP tool missing its mandatory inputSchema definition entirely.',
    parameters: undefined
  },

  // 13. Adversarial MCP: Sub-threshold Description Quality
  mcp_low_quality_description: {
    name: 'fetch_data',
    description: 'TODO',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Resource key' }
      }
    }
  },

  // 14. Adversarial Circular: Direct Self-Reference
  adversarial_circular_direct: (() => {
    const root = {
      name: 'circular_self_tool',
      description: 'Adversarial schema containing a direct cyclical self-reference on parameters properties.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Node title' }
        }
      }
    };
    // Inject direct circular link
    root.parameters.properties.cyclicChild = root.parameters;
    return root;
  })(),

  // 15. Adversarial Circular: Multi-hop Loop (A -> B -> C -> A)
  adversarial_circular_multihop: (() => {
    const nodeA = { type: 'object', properties: {} };
    const nodeB = { type: 'object', properties: {} };
    const nodeC = { type: 'object', properties: {} };
    nodeA.properties.next = nodeB;
    nodeB.properties.next = nodeC;
    nodeC.properties.next = nodeA;

    return {
      name: 'circular_multihop_tool',
      description: 'Adversarial schema containing a multi-hop circular reference cycle across 3 tree levels.',
      parameters: nodeA
    };
  })(),

  // 16. Adversarial Deeply Nested: 14 Levels Deep
  adversarial_deeply_nested: (() => {
    let current = {
      type: 'object',
      properties: {
        leafValue: { type: 'string', description: 'Deep leaf string property' }
      }
    };
    for (let depth = 13; depth >= 1; depth--) {
      current = {
        type: 'object',
        properties: {
          [`level_${depth}`]: current
        }
      };
    }
    return {
      name: 'deeply_nested_schema_tool',
      description: 'Adversarial schema testing recursive parser stack resilience with 14 levels of nested objects.',
      parameters: current
    };
  })(),

  // 17. Adversarial Inverted Numeric Bounds (minimum > maximum)
  adversarial_inverted_bounds: {
    name: 'broken_bounds_tool',
    description: 'Adversarial tool definition with inverted numeric ranges where minimum is strictly greater than maximum.',
    parameters: {
      type: 'object',
      properties: {
        portRange: {
          type: 'integer',
          minimum: 65535,
          maximum: 80,
          description: 'Impossible port range'
        }
      }
    }
  },

  // 18. Adversarial Duplicate and Empty Enums
  adversarial_broken_enums: {
    name: 'broken_enums_tool',
    description: 'Adversarial tool definition with redundant duplicate enum members and invalid empty enum array.',
    parameters: {
      type: 'object',
      properties: {
        emptyList: {
          type: 'string',
          enum: [],
          description: 'Empty enum array property'
        },
        duplicateList: {
          type: 'string',
          enum: ['production', 'staging', 'production', 'development', 'staging'],
          description: 'Enum array with duplicate values'
        }
      }
    }
  },

  // 19. Adversarial Prototype Pollution Keys
  adversarial_prototype_keys: {
    name: 'prototype_safety_tool',
    description: 'Adversarial tool definition probing prototype pollution vulnerabilities using reserved property names.',
    parameters: {
      type: 'object',
      properties: {
        __proto__: { type: 'string', description: 'Attempted prototype pollution property key' },
        constructor: { type: 'string', description: 'Constructor override test key' },
        toString: { type: 'string', description: 'Built-in toString method override test' }
      }
    }
  },

  // 20. Adversarial Schema Drift (Mixed and Missing Items)
  adversarial_schema_drift: {
    name: 'drifted_schema_tool',
    description: 'Simulates schema drift where an array property omits items spec and an invalid type keyword is used.',
    parameters: {
      type: 'object',
      properties: {
        untypedCollection: {
          type: 'array',
          description: 'Array missing items schema specification'
        },
        unsupportedScalar: {
          type: 'float_decimal',
          description: 'Non-standard invalid JSON Schema type keyword'
        }
      }
    }
  }
};

// ============================================================================
// TEST SUITE: 20 BENCHMARK SCHEMAS AUDIT
// ============================================================================

test('SchemaGuard Benchmark: 20 AI Tool Schemas Audit', async (t) => {
  let passedCount = 0;
  const startTime = Date.now();

  // 1. Google Gemini Search Grounding
  await t.test('1. Gemini Search Grounding: compliant & detected as gemini', () => {
    const tool = BENCHMARK_SCHEMAS.gemini_search_grounding;
    const format = detectFormat(tool);
    assert.equal(format, 'gemini');
    const result = lintTool(tool);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.score >= 90);
    passedCount++;
  });

  // 2. Google Gemini Code Execution
  await t.test('2. Gemini Code Execution: valid execution schema', () => {
    const tool = BENCHMARK_SCHEMAS.gemini_code_execution;
    const result = lintTool(tool);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.score >= 90);
    passedCount++;
  });

  // 3. Anthropic Claude Artifacts Patch
  await t.test('3. Claude Artifacts Patch: compliant nested anthropic format', () => {
    const tool = BENCHMARK_SCHEMAS.claude_artifacts_patch;
    const format = detectFormat(tool);
    assert.equal(format, 'anthropic');
    const result = lintTool(tool);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.score >= 90);
    passedCount++;
  });

  // 4. Anthropic Claude Computer Use
  await t.test('4. Claude Computer Use: validates coordinate array and enum actions', () => {
    const tool = BENCHMARK_SCHEMAS.claude_computer_use;
    const result = lintTool(tool);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    passedCount++;
  });

  // 5. OpenAI Structured SQL Strict Mode
  await t.test('5. OpenAI Structured SQL: strict structured outputs pass audit', () => {
    const tool = BENCHMARK_SCHEMAS.openai_structured_sql;
    const format = detectFormat(tool);
    assert.equal(format, 'openai');
    const result = lintTool(tool, { strictMode: true });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    passedCount++;
  });

  // 6. OpenAI Financial Ledger Extractor
  await t.test('6. OpenAI Financial Ledger: handles multi-level nested item arrays', () => {
    const tool = BENCHMARK_SCHEMAS.openai_financial_extractor;
    const result = lintTool(tool);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    passedCount++;
  });

  // 7. MCP FileSystem Read (Compliant)
  await t.test('7. MCP FileSystem Read: fully compliant MCP tool definition', () => {
    const tool = BENCHMARK_SCHEMAS.mcp_filesystem_read;
    const format = detectFormat(tool);
    assert.equal(format, 'mcp');
    const result = lintTool(tool);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.score >= 90);
    passedCount++;
  });

  // 8. MCP Knowledge Graph (Compliant)
  await t.test('8. MCP Knowledge Graph: passes enum and numeric bounds checks', () => {
    const tool = BENCHMARK_SCHEMAS.mcp_knowledge_graph;
    const result = lintTool(tool);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    passedCount++;
  });

  // 9. Adversarial MCP: Invalid Name with Spaces
  await t.test('9. Adversarial MCP Name Spaces: flags MCP regex violation', () => {
    const tool = BENCHMARK_SCHEMAS.mcp_invalid_name_spaces;
    const result = lintTool(tool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'MCP_INVALID_TOOL_NAME' || e.code === 'INVALID_TOOL_NAME'));
    passedCount++;
  });

  // 10. Adversarial MCP: Name Exceeding 64 Chars
  await t.test('10. Adversarial MCP Name Length: flags name exceeding 64 chars', () => {
    const tool = BENCHMARK_SCHEMAS.mcp_invalid_name_too_long;
    const result = lintTool(tool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'MCP_INVALID_TOOL_NAME' || e.code === 'INVALID_TOOL_NAME'));
    passedCount++;
  });

  // 11. Adversarial MCP: inputSchema type is 'string'
  await t.test('11. Adversarial MCP inputSchema: rejects non-object type', () => {
    const tool = BENCHMARK_SCHEMAS.mcp_invalid_input_schema_type;
    const result = lintTool(tool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'MCP_INPUT_SCHEMA_NOT_OBJECT' || e.code === 'ROOT_MUST_BE_OBJECT'));
    passedCount++;
  });

  // 12. Adversarial MCP: Missing inputSchema
  await t.test('12. Adversarial MCP Missing inputSchema: catches missing schema', () => {
    const tool = BENCHMARK_SCHEMAS.mcp_missing_input_schema;
    const result = lintTool(tool, { targetProvider: 'mcp' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'MCP_MISSING_INPUT_SCHEMA'));
    passedCount++;
  });

  // 13. Adversarial MCP: Low Quality Description
  await t.test('13. Adversarial MCP Description: flags low-quality placeholder description', () => {
    const tool = BENCHMARK_SCHEMAS.mcp_low_quality_description;
    const result = lintTool(tool);
    assert.ok(
      result.warnings.some(
        (w) => w.code === 'VAGUE_TOOL_DESCRIPTION' || w.code === 'LOW_QUALITY_DESCRIPTION' || w.code === 'MCP_DESCRIPTION_BELOW_THRESHOLD'
      )
    );
    passedCount++;
  });

  // 14. Adversarial Circular: Direct Self-Reference
  await t.test('14. Adversarial Direct Circular: catches cycle without stack overflow', () => {
    const tool = BENCHMARK_SCHEMAS.adversarial_circular_direct;
    assert.equal(detectCircularReferences(tool), true);
    const result = lintTool(tool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'CIRCULAR_REFERENCE'));
    passedCount++;
  });

  // 15. Adversarial Circular: Multi-hop Loop
  await t.test('15. Adversarial Multi-hop Circular: detects 3-node cycle', () => {
    const tool = BENCHMARK_SCHEMAS.adversarial_circular_multihop;
    assert.equal(detectCircularReferences(tool), true);
    const result = lintTool(tool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'CIRCULAR_REFERENCE'));
    passedCount++;
  });

  // 16. Adversarial Deeply Nested: 14 Levels Deep
  await t.test('16. Adversarial Deeply Nested: flags excessive nesting depth safely', () => {
    const tool = BENCHMARK_SCHEMAS.adversarial_deeply_nested;
    const result = lintTool(tool, { maxNestingDepth: 4 });
    assert.ok(result.warnings.some((w) => w.code === 'EXCESSIVE_NESTING'));
    passedCount++;
  });

  // 17. Adversarial Inverted Numeric Bounds
  await t.test('17. Adversarial Inverted Bounds: rejects minimum > maximum', () => {
    const tool = BENCHMARK_SCHEMAS.adversarial_inverted_bounds;
    const result = lintTool(tool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'INVALID_NUMERIC_BOUNDS'));
    passedCount++;
  });

  // 18. Adversarial Broken Enums
  await t.test('18. Adversarial Broken Enums: flags empty and duplicate enums', () => {
    const tool = BENCHMARK_SCHEMAS.adversarial_broken_enums;
    const result = lintTool(tool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'EMPTY_ENUM'));
    assert.ok(result.warnings.some((w) => w.code === 'DUPLICATE_ENUM_VALUES'));
    passedCount++;
  });

  // 19. Adversarial Prototype Pollution Keys
  await t.test('19. Adversarial Prototype Keys: parses and audits safely without pollution', () => {
    const tool = BENCHMARK_SCHEMAS.adversarial_prototype_keys;
    const result = lintTool(tool);
    // Object prototype must remain untainted
    assert.equal(({})['__proto__'], Object.prototype);
    assert.equal(typeof ({}).toString, 'function');
    assert.equal(result.toolName, 'prototype_safety_tool');
    passedCount++;
  });

  // 20. Adversarial Schema Drift
  await t.test('20. Adversarial Schema Drift: catches untyped array items and illegal type keywords', () => {
    const tool = BENCHMARK_SCHEMAS.adversarial_schema_drift;
    const result = lintTool(tool);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'ARRAY_MISSING_ITEMS'));
    assert.ok(result.errors.some((e) => e.code === 'INVALID_TYPE_KEYWORD'));
    passedCount++;
  });

  const duration = Date.now() - startTime;
  assert.equal(passedCount, 20);
  console.log(`\n✔ 20/20 Schema Fuzzing & Drift Benchmark tests completed in ${duration}ms! Pass rate: 100%`);
});

// ============================================================================
// TEST SUITE: SYNTHETIC MOCK ARGUMENT GENERATION FOR EDGE CASES
// ============================================================================

test('Synthetic Mock Argument Generation for Edge Cases', async (t) => {
  await t.test('generates edge arguments satisfying numeric boundaries', () => {
    const tool = {
      name: 'bounded_resource_allocator',
      description: 'Allocates compute memory and thread workers within precise hardware constraints.',
      parameters: {
        type: 'object',
        properties: {
          memoryMb: { type: 'integer', minimum: 128, maximum: 65536, description: 'Memory in megabytes' },
          cpuRatio: { type: 'number', minimum: 0.1, maximum: 1.0, description: 'CPU share ratio' },
          logLevel: { type: 'string', enum: ['trace', 'debug', 'info', 'warn', 'error'], description: 'Logging level' },
          label: { type: 'string', minLength: 3, maxLength: 30, description: 'Pod deployment label' }
        },
        required: ['memoryMb', 'cpuRatio', 'logLevel', 'label']
      }
    };

    // Edge mode generation
    const edgeMock = generateMock(tool, { mode: 'edge' });
    assert.equal(edgeMock.memoryMb, 128); // minimum bound
    assert.equal(edgeMock.cpuRatio, 0.1); // minimum bound
    assert.equal(edgeMock.logLevel, 'error'); // boundary: last enum item
    assert.equal(edgeMock.label.length >= 3, true); // minLength respected

    // Validate edge mock against runtime validator
    const runtimeResult = validateRuntimePayload(tool, edgeMock);
    assert.equal(runtimeResult.valid, true);
    assert.equal(runtimeResult.errors.length, 0);
  });

  await t.test('generates happy and minimal mock arguments correctly', () => {
    const tool = BENCHMARK_SCHEMAS.mcp_filesystem_read;
    const happyMock = generateMock(tool, { mode: 'happy' });
    assert.ok(happyMock.uri);
    assert.equal(happyMock.byteOffset, 0); // default value
    assert.ok(typeof happyMock.byteLimit === 'number');

    const minimalMock = generateMock(tool, { mode: 'minimal' });
    assert.ok(minimalMock.uri);
    assert.equal(minimalMock.byteOffset, undefined);
    assert.equal(minimalMock.byteLimit, undefined);

    const runtimeRes = validateRuntimePayload(tool, minimalMock);
    assert.equal(runtimeRes.valid, true);
  });

  await t.test('handles mock generation on circular and deeply nested schemas without crashing', () => {
    const circularTool = BENCHMARK_SCHEMAS.adversarial_circular_direct;
    // Must not crash or infinite loop
    const mock = generateMock(circularTool);
    assert.ok(typeof mock === 'object');

    const deepTool = BENCHMARK_SCHEMAS.adversarial_deeply_nested;
    const deepMock = generateMock(deepTool);
    assert.ok(typeof deepMock === 'object');
  });

  await t.test('cross-provider conversion preserves schema fidelity', () => {
    const mcpTool = BENCHMARK_SCHEMAS.mcp_filesystem_read;
    const universal = normalizeToUniversal(mcpTool);

    // Convert to OpenAI Strict
    const openaiStrict = exportTo(universal, 'openai', { strict: true });
    assert.equal(openaiStrict.type, 'function');
    assert.equal(openaiStrict.function.strict, true);
    assert.equal(openaiStrict.function.parameters.additionalProperties, false);

    // Convert to Anthropic
    const anthropic = exportTo(universal, 'anthropic');
    assert.equal(anthropic.name, 'read_filesystem_resource');
    assert.ok(anthropic.input_schema);

    // Convert to Gemini
    const gemini = exportTo(universal, 'gemini', { asArray: true });
    assert.ok(Array.isArray(gemini.functionDeclarations));
    assert.equal(gemini.functionDeclarations[0].name, 'read_filesystem_resource');
  });
});
