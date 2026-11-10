/**
 * schemaguard — Tool Definition Validator & Linter
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

const VALID_TOOL_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const VALID_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);

export interface LintOptions {
  strictMode?: boolean;
  targetProvider?: ToolFormat;
  maxNestingDepth?: number;
}

export function lintTool(
  toolInput: unknown,
  options: LintOptions = {}
): LintResult {
  const detectedFormat = detectFormat(toolInput);
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

  // 1. Tool Name Validation
  if (!tool.name || tool.name.trim() === '') {
    diagnostics.push({
      code: 'MISSING_TOOL_NAME',
      message: 'Tool name is missing or empty',
      path: 'name',
      severity: 'error',
      fixSuggestion: 'Provide a descriptive tool name (e.g., "query_database")'
    });
  } else if (!VALID_TOOL_NAME_REGEX.test(tool.name)) {
    diagnostics.push({
      code: 'INVALID_TOOL_NAME',
      message: `Tool name "${tool.name}" contains invalid characters or exceeds 64 chars. Must match /^[a-zA-Z0-9_-]{1,64}$/`,
      path: 'name',
      severity: 'error',
      fixSuggestion: 'Use only alphanumeric characters, underscores, and dashes under 64 characters'
    });
  }

  // 2. Tool Description Validation
  if (!tool.description || tool.description.trim() === '') {
    diagnostics.push({
      code: 'EMPTY_TOOL_DESCRIPTION',
      message: 'Tool description is completely missing or empty. LLMs cannot reliably determine when to call this tool',
      path: 'description',
      severity: 'error',
      fixSuggestion: 'Add an actionable description explaining the purpose, constraints, and return value'
    });
  } else if (tool.description.trim().length < 15) {
    diagnostics.push({
      code: 'VAGUE_TOOL_DESCRIPTION',
      message: `Tool description "${tool.description}" is under 15 characters, which degrades model tool-calling accuracy`,
      path: 'description',
      severity: 'warning',
      fixSuggestion: 'Expand description with specific context, prerequisites, and expected outcomes'
    });
  }

  // 3. Parameters Root Schema Validation
  const params = tool.parameters;
  if (!params || typeof params !== 'object') {
    diagnostics.push({
      code: 'INVALID_PARAMETERS_ROOT',
      message: 'Tool parameters must be a valid JSON Schema object',
      path: 'parameters',
      severity: 'error',
      fixSuggestion: 'Define parameters as { type: "object", properties: { ... } }'
    });
  } else {
    if (params.type !== 'object') {
      diagnostics.push({
        code: 'ROOT_MUST_BE_OBJECT',
        message: `Tool parameters root type must be "object", found "${params.type ?? 'undefined'}"`,
        path: 'parameters.type',
        severity: 'error',
        fixSuggestion: 'Set parameters.type to "object"'
      });
    }

    if (!params.properties || typeof params.properties !== 'object') {
      diagnostics.push({
        code: 'MISSING_PROPERTIES',
        message: 'Tool parameters object has no "properties" definition',
        path: 'parameters.properties',
        severity: 'warning',
        fixSuggestion: 'Define properties object, or use {} for zero-parameter tools'
      });
    }

    if (isStrict) {
      if (params.additionalProperties !== false) {
        diagnostics.push({
          code: 'STRICT_ADDITIONAL_PROPERTIES_FALSE',
          message: 'In strict mode (Structured Outputs), root object must have additionalProperties: false',
          path: 'parameters.additionalProperties',
          severity: 'error',
          fixSuggestion: 'Set "additionalProperties": false on root schema'
        });
      }
    }

    // Recursive inspection of schema nodes
    traverseSchema(params, 'parameters', 1, maxDepth, isStrict, diagnostics);
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
  diagnostics: Diagnostic[]
): void {
  if (depth > maxDepth) {
    diagnostics.push({
      code: 'EXCESSIVE_NESTING',
      message: `Schema nesting depth (${depth}) exceeds recommended threshold (${maxDepth}). LLMs often fail to navigate deep schemas`,
      path: currentPath,
      severity: 'warning',
      fixSuggestion: 'Flatten nested objects or break down into multiple specialized tools'
    });
  }

  // Check for disallowed keywords in LLM tool calling
  if (node.$ref) {
    diagnostics.push({
      code: 'UNSUPPORTED_REF_KEYWORD',
      message: `Found "$ref: ${node.$ref}". Most LLM providers do not resolve JSON Schema $ref pointers at runtime`,
      path: `${currentPath}.$ref`,
      severity: 'error',
      fixSuggestion: 'Inline the referenced schema definition directly'
    });
  }

  if (node.$schema) {
    diagnostics.push({
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
        diagnostics.push({
          code: 'INVALID_TYPE_KEYWORD',
          message: `Unknown schema type "${node.type}". Must be one of: ${Array.from(VALID_TYPES).join(', ')}`,
          path: `${currentPath}.type`,
          severity: 'error'
        });
      }
    } else if (Array.isArray(node.type)) {
      for (const t of node.type) {
        if (!VALID_TYPES.has(t)) {
          diagnostics.push({
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
      diagnostics.push({
        code: 'ARRAY_MISSING_ITEMS',
        message: 'Array property is missing an "items" schema specification',
        path: `${currentPath}.items`,
        severity: 'error',
        fixSuggestion: 'Specify the item type, e.g. "items": { "type": "string" }'
      });
    } else if (!Array.isArray(node.items)) {
      traverseSchema(node.items, `${currentPath}.items`, depth + 1, maxDepth, isStrict, diagnostics);
    }
  }

  // Enum checks
  if (node.enum !== undefined) {
    if (!Array.isArray(node.enum) || node.enum.length === 0) {
      diagnostics.push({
        code: 'EMPTY_ENUM',
        message: 'Enum definition must be a non-empty array',
        path: `${currentPath}.enum`,
        severity: 'error',
        fixSuggestion: 'Provide at least one allowed value or remove the enum'
      });
    } else {
      const unique = new Set(node.enum.map((v) => JSON.stringify(v)));
      if (unique.size !== node.enum.length) {
        diagnostics.push({
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
          diagnostics.push({
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
      const propPath = `${currentPath}.properties.${propName}`;

      // Check property description
      if (!propSchema.description || propSchema.description.trim() === '') {
        diagnostics.push({
          code: 'MISSING_PROPERTY_DESCRIPTION',
          message: `Property "${propName}" lacks a description. LLMs have high error rates without explicit argument instructions`,
          path: `${propPath}.description`,
          severity: 'warning',
          fixSuggestion: `Add description explaining format, constraints, and intent for "${propName}"`
        });
      }

      // Check numeric bounds
      if (propSchema.type === 'number' || propSchema.type === 'integer') {
        if (propSchema.minimum !== undefined && propSchema.maximum !== undefined) {
          if (propSchema.minimum > propSchema.maximum) {
            diagnostics.push({
              code: 'INVALID_NUMERIC_BOUNDS',
              message: `Minimum (${propSchema.minimum}) is greater than maximum (${propSchema.maximum}) for property "${propName}"`,
              path: propPath,
              severity: 'error'
            });
          }
        }
      }

      traverseSchema(propSchema, propPath, depth + 1, maxDepth, isStrict, diagnostics);
    }
  }
}
