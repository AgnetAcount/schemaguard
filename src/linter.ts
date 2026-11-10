/**
 * schemaguard — Tool Definition Validator & Modular Linter
 * Agnet Software Corp.
 */

import {
  UniversalTool,
  Diagnostic,
  LintResult,
  JSONSchema,
  ToolFormat
} from './types.js';
import { normalizeToUniversal, detectFormat } from './converter.js';
import { getAllRules, Rule, RuleContext } from './rules/index.js';

const VALID_TOOL_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const VALID_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);

export interface LintOptions {
  strictMode?: boolean;
  targetProvider?: ToolFormat;
  maxNestingDepth?: number;
  descriptionMinLength?: number;
  checkCircular?: boolean;
  rules?: Rule[];
}

/**
 * Audit and score an AI agent tool schema across providers and specifications.
 */
export function lintTool(
  toolInput: unknown,
  options: LintOptions = {}
): LintResult {
  const detectedFormat = options.targetProvider || detectFormat(toolInput);
  let tool: UniversalTool;

  try {
    tool = normalizeToUniversal(toolInput, detectedFormat);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      toolName: 'unknown',
      detectedFormat,
      score: 0,
      errors: [
        {
          code: 'PARSE_FAILED',
          message: errorMsg,
          path: '',
          severity: 'error'
        }
      ],
      warnings: [],
      infos: []
    };
  }

  const diagnostics: Diagnostic[] = [];
  const maxDepth = options.maxNestingDepth ?? 4;
  const isStrict = Boolean(options.strictMode || tool.strict);
  const isMcp = detectedFormat === 'mcp';

  const report = (diag: Diagnostic) => {
    // Avoid exact duplicate diagnostics
    const exists = diagnostics.some(
      (d) => d.code === diag.code && d.path === diag.path && d.message === diag.message
    );
    if (!exists) {
      diagnostics.push(diag);
    }
  };

  // Run modular rules suite (MCP, Circular Reference, Quality, etc.)
  const context: RuleContext = {
    tool,
    rawInput: toolInput,
    format: detectedFormat,
    options,
    diagnostics,
    report
  };

  const activeRules = options.rules ?? getAllRules();
  for (const rule of activeRules) {
    try {
      rule.run(context);
    } catch {
      // Rule failure shouldn't crash the linter
    }
  }

  // 1. Tool Name Validation (Standard baseline)
  if (!tool.name || tool.name.trim() === '') {
    report({
      code: 'MISSING_TOOL_NAME',
      message: 'Tool name is missing or empty',
      path: 'name',
      severity: 'error',
      fixSuggestion: 'Provide a descriptive tool name (e.g., "query_database")'
    });
  } else if (!VALID_TOOL_NAME_REGEX.test(tool.name)) {
    report({
      code: 'INVALID_TOOL_NAME',
      message: `Tool name "${tool.name}" contains invalid characters or exceeds 64 chars. Must match /^[a-zA-Z0-9_-]{1,64}$/`,
      path: 'name',
      severity: 'error',
      fixSuggestion: 'Use only alphanumeric characters, underscores, and dashes under 64 characters'
    });
  }

  // 2. Parameters Root Schema Validation
  const params = tool.parameters;
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    report({
      code: 'INVALID_PARAMETERS_ROOT',
      message: 'Tool parameters must be a valid JSON Schema object',
      path: 'parameters',
      severity: 'error',
      fixSuggestion: 'Define parameters as { type: "object", properties: { ... } }'
    });
  } else {
    if (params.type !== 'object') {
      report({
        code: 'ROOT_MUST_BE_OBJECT',
        message: `Tool parameters root type must be "object", found "${params.type ?? 'undefined'}"`,
        path: isMcp ? 'inputSchema.type' : 'parameters.type',
        severity: 'error',
        fixSuggestion: 'Set parameters.type to "object"'
      });
    }

    if (!params.properties || typeof params.properties !== 'object') {
      report({
        code: 'MISSING_PROPERTIES',
        message: 'Tool parameters object has no "properties" definition',
        path: isMcp ? 'inputSchema.properties' : 'parameters.properties',
        severity: 'warning',
        fixSuggestion: 'Define properties object, or use {} for zero-parameter tools'
      });
    }

    if (isStrict) {
      if (params.additionalProperties !== false) {
        report({
          code: 'STRICT_ADDITIONAL_PROPERTIES_FALSE',
          message: 'In strict mode (Structured Outputs), root object must have additionalProperties: false',
          path: 'parameters.additionalProperties',
          severity: 'error',
          fixSuggestion: 'Set "additionalProperties": false on root schema'
        });
      }
    }

    // Recursive inspection of schema nodes with cycle prevention
    const rootPath = isMcp ? 'inputSchema' : 'parameters';
    traverseSchema(params, rootPath, 1, maxDepth, isStrict, report, new Set<object>());
  }

  // Split diagnostics by severity
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');
  const infos = diagnostics.filter((d) => d.severity === 'info');

  // Compute quality score: 100 - (errors * 25) - (warnings * 5) - (infos * 1)
  const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 5 - infos.length);

  return {
    valid: errors.length === 0,
    toolName: tool.name,
    detectedFormat,
    score,
    errors,
    warnings,
    infos
  };
}

function traverseSchema(
  node: JSONSchema,
  currentPath: string,
  depth: number,
  maxDepth: number,
  isStrict: boolean,
  report: (diag: Diagnostic) => void,
  visitedStack: Set<object>
): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  // Circular reference detection in traversal branch
  if (visitedStack.has(node)) {
    report({
      code: 'CIRCULAR_REFERENCE',
      message: `Circular reference detected in schema definition at "${currentPath}"`,
      path: currentPath,
      severity: 'error',
      fixSuggestion: 'Remove cyclical or recursive schema definitions; AI tool schemas must be finite trees'
    });
    return;
  }

  visitedStack.add(node);

  try {
    if (depth > maxDepth) {
      report({
        code: 'EXCESSIVE_NESTING',
        message: `Schema nesting depth (${depth}) exceeds recommended threshold (${maxDepth}). LLMs often fail to navigate deep schemas`,
        path: currentPath,
        severity: 'warning',
        fixSuggestion: 'Flatten nested objects or break down into multiple specialized tools'
      });
    }

    // Check for disallowed keywords in LLM tool calling
    if (node.$ref) {
      report({
        code: 'UNSUPPORTED_REF_KEYWORD',
        message: `Found "$ref: ${node.$ref}". Most LLM providers do not resolve JSON Schema $ref pointers at runtime`,
        path: `${currentPath}.$ref`,
        severity: 'error',
        fixSuggestion: 'Inline the referenced schema definition directly'
      });
    }

    if (node.$schema) {
      report({
        code: 'UNNECESSARY_SCHEMA_KEYWORD',
        message: `Found "$schema" meta-keyword. LLM tool parsers do not evaluate external JSON schema drafts`,
        path: `${currentPath}.$schema`,
        severity: 'info',
        fixSuggestion: 'Remove $schema keyword to reduce token overhead'
      });
    }

    // Type validation
    if (node.type !== undefined) {
      if (typeof node.type === 'string') {
        if (!VALID_TYPES.has(node.type)) {
          report({
            code: 'INVALID_TYPE_KEYWORD',
            message: `Unknown schema type "${node.type}". Must be one of: ${Array.from(VALID_TYPES).join(', ')}`,
            path: `${currentPath}.type`,
            severity: 'error'
          });
        }
      } else if (Array.isArray(node.type)) {
        for (const t of node.type) {
          if (!VALID_TYPES.has(t)) {
            report({
              code: 'INVALID_TYPE_KEYWORD',
              message: `Unknown union type member "${t}"`,
              path: `${currentPath}.type`,
              severity: 'error'
            });
          }
        }
      }
    }

    // Array checks
    if (node.type === 'array') {
      if (!node.items || (typeof node.items === 'object' && Object.keys(node.items).length === 0)) {
        report({
          code: 'ARRAY_MISSING_ITEMS',
          message: 'Array property is missing an "items" schema specification',
          path: `${currentPath}.items`,
          severity: 'error',
          fixSuggestion: 'Specify the item type, e.g. "items": { "type": "string" }'
        });
      } else if (!Array.isArray(node.items)) {
        traverseSchema(node.items, `${currentPath}.items`, depth + 1, maxDepth, isStrict, report, visitedStack);
      }
    }

    // Enum checks
    if (node.enum !== undefined) {
      if (!Array.isArray(node.enum) || node.enum.length === 0) {
        report({
          code: 'EMPTY_ENUM',
          message: 'Enum definition must be a non-empty array',
          path: `${currentPath}.enum`,
          severity: 'error',
          fixSuggestion: 'Provide at least one allowed value or remove the enum'
        });
      } else {
        const unique = new Set(node.enum.map((v) => JSON.stringify(v)));
        if (unique.size !== node.enum.length) {
          report({
            code: 'DUPLICATE_ENUM_VALUES',
            message: 'Enum contains duplicate values',
            path: `${currentPath}.enum`,
            severity: 'warning',
            fixSuggestion: 'Remove duplicate enum entries'
          });
        }
      }
    }

    // Object checks
    if (node.properties && typeof node.properties === 'object') {
      const propKeys = Object.keys(node.properties);
      const requiredList = Array.isArray(node.required) ? node.required : [];

      // Check strict mode completeness
      if (isStrict) {
        for (const propKey of propKeys) {
          if (!requiredList.includes(propKey)) {
            report({
              code: 'STRICT_MISSING_REQUIRED',
              message: `Property "${propKey}" is not listed in "required" array under strict mode`,
              path: `${currentPath}.required`,
              severity: 'error',
              fixSuggestion: `Add "${propKey}" to required array or provide a fallback`
            });
          }
        }
      }

      for (const [propName, propSchema] of Object.entries(node.properties)) {
        if (!propSchema || typeof propSchema !== 'object') continue;
        const propPath = `${currentPath}.properties.${propName}`;

        // Check numeric bounds
        if (propSchema.type === 'number' || propSchema.type === 'integer') {
          if (propSchema.minimum !== undefined && propSchema.maximum !== undefined) {
            if (propSchema.minimum > propSchema.maximum) {
              report({
                code: 'INVALID_NUMERIC_BOUNDS',
                message: `Minimum (${propSchema.minimum}) is greater than maximum (${propSchema.maximum}) for property "${propName}"`,
                path: propPath,
                severity: 'error'
              });
            }
          }
        }

        traverseSchema(propSchema, propPath, depth + 1, maxDepth, isStrict, report, visitedStack);
      }
    }
  } finally {
    visitedStack.delete(node);
  }
}
