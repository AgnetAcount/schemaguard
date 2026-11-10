/**
 * schemaguard — Model Context Protocol (MCP) Tool Schema Rules
 * Agnet Software Corp.
 */

import { Rule, RuleContext } from './types.js';

export const MCP_TOOL_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validates MCP tool naming according to Model Context Protocol specification.
 * - Must be non-empty string.
 * - Maximum length 64 characters.
 * - Must match /^[a-zA-Z0-9_-]{1,64}$/.
 */
export const mcpToolNameRule: Rule = {
  id: 'MCP_TOOL_NAME',
  name: 'MCP Tool Name Format',
  description: 'Enforces tool name regex formatting (/^[a-zA-Z0-9_-]{1,64}$/) and length constraints for MCP compatibility.',
  run(context: RuleContext): void {
    const isMcp = context.format === 'mcp' || context.options.targetProvider === 'mcp';
    const name = context.tool.name;

    if (!name || name.trim() === '') {
      if (isMcp) {
        context.report({
          code: 'MCP_INVALID_TOOL_NAME',
          message: 'MCP tool name is missing or empty.',
          path: 'name',
          severity: 'error',
          fixSuggestion: 'Provide a valid identifier for the MCP tool (e.g., "fetch_resource")'
        });
      }
      return;
    }

    if (!MCP_TOOL_NAME_REGEX.test(name)) {
      if (isMcp) {
        context.report({
          code: 'MCP_INVALID_TOOL_NAME',
          message: `MCP tool name "${name}" violates MCP identifier naming rules. Must match /^[a-zA-Z0-9_-]{1,64}$/ without spaces or special symbols.`,
          path: 'name',
          severity: 'error',
          fixSuggestion: 'Rename tool using only alphanumeric characters, underscores, and dashes under 64 characters'
        });
      }
    }
  }
};

/**
 * Validates that MCP tools have a compliant 'inputSchema' with type 'object'.
 */
export const mcpInputSchemaRule: Rule = {
  id: 'MCP_INPUT_SCHEMA',
  name: 'MCP inputSchema Validation',
  description: 'Ensures Model Context Protocol tools declare an inputSchema object with type: "object".',
  run(context: RuleContext): void {
    const isMcp = context.format === 'mcp' || context.options.targetProvider === 'mcp';
    if (!isMcp) {
      return;
    }

    const raw = context.rawInput as Record<string, unknown> | null | undefined;

    // 1. Check existence of inputSchema in raw definition
    if (!raw || typeof raw !== 'object' || !('inputSchema' in raw) || raw.inputSchema === undefined || raw.inputSchema === null) {
      context.report({
        code: 'MCP_MISSING_INPUT_SCHEMA',
        message: 'MCP tool definition must declare an "inputSchema" property.',
        path: 'inputSchema',
        severity: 'error',
        fixSuggestion: 'Add "inputSchema": { "type": "object", "properties": {} } to the MCP tool definition'
      });
      return;
    }

    const inputSchema = raw.inputSchema as Record<string, unknown>;

    // 2. Check inputSchema is an object and not an array
    if (typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
      context.report({
        code: 'MCP_INPUT_SCHEMA_NOT_OBJECT',
        message: `MCP tool "inputSchema" must be a JSON Schema object, received "${Array.isArray(inputSchema) ? 'array' : typeof inputSchema}".`,
        path: 'inputSchema',
        severity: 'error',
        fixSuggestion: 'Set "inputSchema" to a valid JSON schema object with type: "object"'
      });
      return;
    }

    // 3. Check inputSchema.type is 'object'
    if (inputSchema.type !== 'object') {
      context.report({
        code: 'MCP_INPUT_SCHEMA_NOT_OBJECT',
        message: `MCP tool "inputSchema.type" must be "object", found "${String(inputSchema.type)}". Non-object input schemas are disallowed in MCP.`,
        path: 'inputSchema.type',
        severity: 'error',
        fixSuggestion: 'Set inputSchema.type to "object" and nest arguments under "properties"'
      });
    }
  }
};

/**
 * Validates MCP description quality threshold.
 */
export const mcpQualityRule: Rule = {
  id: 'MCP_QUALITY',
  name: 'MCP Tool Description Quality',
  description: 'Validates that MCP tools meet description quality standards for LLM context dispatching.',
  run(context: RuleContext): void {
    const isMcp = context.format === 'mcp' || context.options.targetProvider === 'mcp';
    if (!isMcp) {
      return;
    }

    const desc = (context.tool.description || '').trim();
    const threshold = context.options.descriptionMinLength ?? 20;

    if (!desc) {
      context.report({
        code: 'MCP_EMPTY_DESCRIPTION',
        message: 'MCP tool is missing a description. MCP clients require clear descriptions to discover and execute tools accurately.',
        path: 'description',
        severity: 'error',
        fixSuggestion: 'Add an actionable description explaining the tool intent, preconditions, and response format'
      });
    } else if (desc.length < threshold) {
      context.report({
        code: 'MCP_DESCRIPTION_BELOW_THRESHOLD',
        message: `MCP tool description length (${desc.length} chars) is below recommended threshold (${threshold} chars). Models may fail tool-selection benchmarks.`,
        path: 'description',
        severity: 'warning',
        fixSuggestion: 'Expand tool description with context, parameter usage, and side effects'
      });
    }
  }
};
