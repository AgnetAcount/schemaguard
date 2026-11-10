/**
 * schemaguard — Synthetic Mock Payload Generator
 * Agnet Software Corp.
 */

import { JSONSchema, UniversalTool } from './types.js';
import { normalizeToUniversal } from './converter.js';

export type MockMode = 'happy' | 'minimal' | 'edge';

export interface MockOptions {
  mode?: MockMode;
  seed?: number;
}

/**
 * Generate a synthetic mock payload conforming to the tool's parameter schema.
 */
export function generateMock(
  toolInput: unknown,
  options: MockOptions = {}
): Record<string, unknown> {
  const mode = options.mode || 'happy';
  const tool: UniversalTool = normalizeToUniversal(toolInput);
  const params = tool.parameters;

  if (!params || params.type !== 'object' || !params.properties) {
    return {};
  }

  return generateObjectMock(params, mode);
}

function generateObjectMock(
  schema: JSONSchema,
  mode: MockMode,
  visited = new Set<object>(),
  depth = 0
): Record<string, unknown> {
  if (depth > 12 || visited.has(schema)) {
    return {};
  }
  visited.add(schema);

  const result: Record<string, unknown> = {};
  const properties = schema.properties || {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);

  for (const [key, prop] of Object.entries(properties)) {
    // In minimal mode, only include required fields
    if (mode === 'minimal' && !required.has(key)) {
      continue;
    }

    result[key] = generateValueMock(key, prop, mode, visited, depth + 1);
  }

  return result;
}

function generateValueMock(
  keyName: string,
  schema: JSONSchema,
  mode: MockMode,
  visited = new Set<object>(),
  depth = 0
): unknown {
  if (!schema || typeof schema !== 'object' || depth > 12 || visited.has(schema)) {
    return 'mock_value';
  }

  // 1. Const or Default
  if (schema.const !== undefined) {
    return schema.const;
  }
  if (mode === 'happy' && schema.default !== undefined) {
    return schema.default;
  }

  // 2. Enum
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (mode === 'edge') {
      return schema.enum[schema.enum.length - 1]; // last enum item
    }
    return schema.enum[0]; // first enum item
  }

  // 3. Types
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  switch (type) {
    case 'string':
      return generateStringMock(keyName, schema, mode);

    case 'number':
    case 'integer':
      return generateNumberMock(schema, type === 'integer', mode);

    case 'boolean':
      return mode === 'edge' ? false : true;

    case 'array':
      return generateArrayMock(keyName, schema, mode, visited, depth + 1);

    case 'object':
      return generateObjectMock(schema, mode, visited, depth + 1);

    case 'null':
      return null;

    default:
      return 'mock_value';
  }
}

function generateStringMock(
  keyName: string,
  schema: JSONSchema,
  mode: MockMode
): string {
  const lower = keyName.toLowerCase();

  if (mode === 'edge') {
    if (schema.minLength !== undefined && schema.minLength > 0) {
      return 'a'.repeat(schema.minLength);
    }
    if (schema.maxLength !== undefined) {
      return 'z'.repeat(Math.min(schema.maxLength, 20));
    }
    return '';
  }

  // Format checks
  if (schema.format === 'email' || lower.includes('email')) {
    return 'user@example.com';
  }
  if (schema.format === 'uri' || schema.format === 'url' || lower.includes('url')) {
    return 'https://example.com/api/v1';
  }
  if (schema.format === 'date' || schema.format === 'date-time' || lower.includes('date')) {
    return '2026-11-10T08:00:00Z';
  }
  if (schema.format === 'uuid' || lower.includes('uuid') || lower.endsWith('_id') || lower === 'id') {
    return 'usr_98a7f43b12e';
  }

  // Semantic heuristic based on parameter name
  if (lower.includes('query') || lower.includes('search')) {
    return 'typescript language server protocol';
  }
  if (lower.includes('name') || lower.includes('title')) {
    return 'Sample Resource Name';
  }
  if (lower.includes('path') || lower.includes('file')) {
    return '/src/index.ts';
  }
  if (lower.includes('content') || lower.includes('text') || lower.includes('message')) {
    return 'Operational payload test content string.';
  }

  return `sample_${keyName}`;
}

function generateNumberMock(
  schema: JSONSchema,
  isInteger: boolean,
  mode: MockMode
): number {
  const min = schema.minimum ?? (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + 1 : 0);
  const max = schema.maximum ?? (schema.exclusiveMaximum !== undefined ? schema.exclusiveMaximum - 1 : 100);

  if (mode === 'edge') {
    return min;
  }

  if (schema.default !== undefined && typeof schema.default === 'number') {
    return schema.default;
  }

  // Middle safe value
  const val = Math.round((min + max) / 2);
  return isInteger ? Math.floor(val) : val;
}

function generateArrayMock(
  keyName: string,
  schema: JSONSchema,
  mode: MockMode,
  visited = new Set<object>(),
  depth = 0
): unknown[] {
  if (!schema.items || Array.isArray(schema.items)) {
    return ['item_1'];
  }

  const itemSchema = schema.items;
  const count = mode === 'minimal' ? (schema.minItems ?? 1) : mode === 'edge' ? (schema.minItems ?? 0) : 2;

  const arr: unknown[] = [];
  for (let i = 0; i < count; i++) {
    arr.push(generateValueMock(`${keyName}_item`, itemSchema, mode, visited, depth + 1));
  }
  return arr;
}
