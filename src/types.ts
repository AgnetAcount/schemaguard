/**
 * schemaguard — Core Type Definitions
 * Agnet Software Corp.
 */

export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'
  | 'null';

export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[];
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema | JSONSchema[];
  enum?: (string | number | boolean | null)[];
  const?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  additionalProperties?: boolean | JSONSchema;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  format?: string;
  title?: string;
  $schema?: string;
  $ref?: string;
  [key: string]: unknown;
}

export type ToolFormat = 'openai' | 'anthropic' | 'gemini' | 'mcp' | 'raw';

export interface UniversalTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  strict?: boolean;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  code: string;
  message: string;
  path: string;
  severity: DiagnosticSeverity;
  fixSuggestion?: string;
}

export interface LintResult {
  valid: boolean;
  toolName: string;
  detectedFormat: ToolFormat;
  score: number; // 0 to 100
  errors: Diagnostic[];
  warnings: Diagnostic[];
  infos: Diagnostic[];
}

export interface RuntimeValidationResult {
  valid: boolean;
  errors: {
    path: string;
    message: string;
    expected?: string;
    received?: unknown;
  }[];
}

// Provider Specific Formats
export interface OpenAIFunction {
  name: string;
  description?: string;
  parameters: JSONSchema;
  strict?: boolean;
}

export interface OpenAIToolDefinition {
  type: 'function';
  function: OpenAIFunction;
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface GeminiToolDefinition {
  functionDeclarations: GeminiFunctionDeclaration[];
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
}
