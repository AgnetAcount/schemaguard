/**
 * schemaguard — Tool Format Converter & Normalizer
 * Agnet Software Corp.
 */

import {
  ToolFormat,
  UniversalTool,
  OpenAIToolDefinition,
  AnthropicToolDefinition,
  GeminiToolDefinition,
  GeminiFunctionDeclaration,
  MCPToolDefinition,
  JSONSchema
} from './types.js';

/**
 * Detect the tool definition format from unknown object structure.
 */
export function detectFormat(data: unknown): ToolFormat {
  if (!data || typeof data !== 'object') {
    return 'raw';
  }

  const obj = data as Record<string, unknown>;

  // OpenAI Tool format: { type: 'function', function: { name: '...', ... } }
  if (obj.type === 'function' && obj.function && typeof obj.function === 'object') {
    return 'openai';
  }

  // Anthropic Tool format: { name: '...', input_schema: { ... } }
  if (typeof obj.name === 'string' && obj.input_schema && typeof obj.input_schema === 'object') {
    return 'anthropic';
  }

  // MCP Tool format: { name: '...', inputSchema: ... }
  if (typeof obj.name === 'string' && 'inputSchema' in obj) {
    return 'mcp';
  }

  // Gemini Tool format: { functionDeclarations: [ { name: '...', parameters: { ... } } ] }
  if (Array.isArray(obj.functionDeclarations) && obj.functionDeclarations.length > 0) {
    return 'gemini';
  }

  // Gemini single function: { name: '...', parameters: { ... } }
  if (typeof obj.name === 'string' && obj.parameters && typeof obj.parameters === 'object') {
    // If it has 'function' key or 'strict', it could be raw or OpenAI function object
    return 'gemini';
  }

  return 'raw';
}

/**
 * Normalize any provider tool format into an authoritative UniversalTool definition.
 */
export function normalizeToUniversal(data: unknown, formatOverride?: ToolFormat): UniversalTool {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid tool definition: Input must be a valid JSON object');
  }

  const format = formatOverride || detectFormat(data);
  const obj = data as Record<string, unknown>;

  switch (format) {
    case 'openai': {
      const fn = (obj.function || obj) as Record<string, unknown>;
      return {
        name: String(fn.name || 'unnamed_tool'),
        description: String(fn.description || ''),
        parameters: (fn.parameters as JSONSchema) || { type: 'object', properties: {} },
        strict: Boolean(fn.strict)
      };
    }

    case 'anthropic': {
      return {
        name: String(obj.name || 'unnamed_tool'),
        description: String(obj.description || ''),
        parameters: (obj.input_schema as JSONSchema) || { type: 'object', properties: {} }
      };
    }

    case 'mcp': {
      let inputSchema = obj.inputSchema as JSONSchema;
      if (inputSchema === undefined || inputSchema === null) {
        inputSchema = { type: 'object', properties: {} };
      }
      return {
        name: String(obj.name || 'unnamed_tool'),
        description: String(obj.description || ''),
        parameters: inputSchema
      };
    }

    case 'gemini': {
      let decl: Record<string, unknown> = obj;
      if (Array.isArray(obj.functionDeclarations) && obj.functionDeclarations[0]) {
        decl = obj.functionDeclarations[0] as Record<string, unknown>;
      }
      return {
        name: String(decl.name || 'unnamed_tool'),
        description: String(decl.description || ''),
        parameters: (decl.parameters as JSONSchema) || { type: 'object', properties: {} }
      };
    }

    case 'raw':
    default: {
      // Check if root itself is a JSONSchema or a tool wrapper
      if (typeof obj.name === 'string' && (obj.parameters || obj.input_schema || obj.inputSchema || obj.properties)) {
        const params = (obj.parameters || obj.input_schema || obj.inputSchema || obj) as JSONSchema;
        return {
          name: obj.name,
          description: String(obj.description || ''),
          parameters: params
        };
      }

      // Root is pure JSONSchema without name
      return {
        name: 'custom_tool',
        description: String(obj.description || 'Custom tool definition'),
        parameters: obj as JSONSchema
      };
    }
  }
}

function safeCloneSchema(schema: JSONSchema, seen = new WeakMap<object, unknown>()): JSONSchema {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  if (seen.has(schema as object)) {
    return { type: 'object', description: '[Circular Reference]' };
  }
  const copy: Record<string, unknown> = Array.isArray(schema) ? ([] as unknown as Record<string, unknown>) : {};
  seen.set(schema as object, copy);
  for (const [key, val] of Object.entries(schema)) {
    if (val && typeof val === 'object') {
      copy[key] = safeCloneSchema(val as JSONSchema, seen);
    } else {
      copy[key] = val;
    }
  }
  return copy as JSONSchema;
}

/**
 * Clean and normalize a JSON schema ensuring deep clone and provider compatibility.
 */
function cleanSchema(schema: JSONSchema, targetFormat: ToolFormat, options?: { strict?: boolean }): JSONSchema {
  const cloned = safeCloneSchema(schema);

  if (targetFormat === 'openai' && options?.strict) {
    // OpenAI structured outputs strict mode requirements:
    // 1. additionalProperties: false on all objects
    // 2. all properties must be listed in required array
    const applyStrict = (node: JSONSchema) => {
      if (node.type === 'object' || (node.properties && !node.type)) {
        node.type = 'object';
        node.additionalProperties = false;
        if (node.properties) {
          node.required = Object.keys(node.properties);
          for (const key of Object.keys(node.properties)) {
            const prop = node.properties[key];
            if (prop) applyStrict(prop);
          }
        }
      } else if (node.type === 'array' && node.items && !Array.isArray(node.items)) {
        applyStrict(node.items);
      }
    };
    applyStrict(cloned);
  }

  return cloned;
}

/**
 * Export a UniversalTool into the specified target provider format.
 */
export function exportTo(
  tool: UniversalTool,
  targetFormat: ToolFormat,
  options?: { strict?: boolean; asArray?: boolean }
): unknown {
  const schema = cleanSchema(tool.parameters, targetFormat, options);

  switch (targetFormat) {
    case 'openai': {
      const res: OpenAIToolDefinition = {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: schema
        }
      };
      if (options?.strict || tool.strict) {
        res.function.strict = true;
      }
      return res;
    }

    case 'anthropic': {
      const res: AnthropicToolDefinition = {
        name: tool.name,
        description: tool.description,
        input_schema: schema
      };
      return res;
    }

    case 'gemini': {
      const decl: GeminiFunctionDeclaration = {
        name: tool.name,
        description: tool.description,
        parameters: schema
      };
      if (options?.asArray) {
        const res: GeminiToolDefinition = {
          functionDeclarations: [decl]
        };
        return res;
      }
      return decl;
    }

    case 'mcp': {
      const res: MCPToolDefinition = {
        name: tool.name,
        description: tool.description,
        inputSchema: schema
      };
      return res;
    }

    case 'raw':
    default:
      return {
        name: tool.name,
        description: tool.description,
        parameters: schema
      };
  }
}
