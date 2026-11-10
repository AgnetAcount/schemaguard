/**
 * schemaguard — High-Speed Microsecond Runtime Payload Validator
 * Agnet Software Corp.
 */

import { JSONSchema, RuntimeValidationResult, UniversalTool } from './types.js';
import { normalizeToUniversal } from './converter.js';

/**
 * Validate runtime arguments (object or JSON string) against tool schema.
 */
export function validateRuntimePayload(
  toolInput: unknown,
  payloadInput: unknown
): RuntimeValidationResult {
  const tool: UniversalTool = normalizeToUniversal(toolInput);
  const schema = tool.parameters;

  let payload = payloadInput;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return {
        valid: false,
        errors: [
          {
            path: '',
            message: 'Malformed JSON payload: Unable to parse arguments string',
            expected: 'Valid JSON object',
            received: payloadInput
          }
        ]
      };
    }
  }

  const errors: RuntimeValidationResult['errors'] = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      errors: [
        {
          path: '',
          message: `Tool arguments must be an object, received "${typeof payload}"`,
          expected: 'object',
          received: payload
        }
      ]
    };
  }

  validateNode(payload, schema, '', errors, new Set<object>(), 0);

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateNode(
  val: unknown,
  schema: JSONSchema,
  path: string,
  errors: RuntimeValidationResult['errors'],
  visited = new Set<object>(),
  depth = 0
): void {
  if (!schema || typeof schema !== 'object' || depth > 20 || visited.has(schema)) {
    return;
  }
  visited.add(schema);
  // 1. Const check
  if (schema.const !== undefined && val !== schema.const) {
    errors.push({
      path,
      message: `Value must equal constant ${JSON.stringify(schema.const)}`,
      expected: JSON.stringify(schema.const),
      received: val
    });
    return;
  }

  // 2. Enum check
  if (Array.isArray(schema.enum) && !schema.enum.includes(val as (string | number | boolean | null))) {
    errors.push({
      path,
      message: `Value ${JSON.stringify(val)} is not an allowed enum member`,
      expected: schema.enum.map((e) => JSON.stringify(e)).join(' | '),
      received: val
    });
    return;
  }

  // 3. Type check
  if (schema.type !== undefined) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = getActualType(val);

    const matchesType = allowedTypes.some((t) => {
      if (t === 'integer') return actualType === 'number' && Number.isInteger(val);
      return actualType === t;
    });

    if (!matchesType) {
      errors.push({
        path,
        message: `Expected type "${allowedTypes.join(' | ')}", received "${actualType}"`,
        expected: allowedTypes.join(' | '),
        received: actualType
      });
      return;
    }
  }

  // 4. String constraints
  if (typeof val === 'string') {
    if (schema.minLength !== undefined && val.length < schema.minLength) {
      errors.push({
        path,
        message: `String length (${val.length}) is shorter than minLength (${schema.minLength})`,
        expected: `>= ${schema.minLength}`,
        received: val.length
      });
    }
    if (schema.maxLength !== undefined && val.length > schema.maxLength) {
      errors.push({
        path,
        message: `String length (${val.length}) is longer than maxLength (${schema.maxLength})`,
        expected: `<= ${schema.maxLength}`,
        received: val.length
      });
    }
    if (schema.pattern) {
      const reg = new RegExp(schema.pattern);
      if (!reg.test(val)) {
        errors.push({
          path,
          message: `String does not match required regex pattern "${schema.pattern}"`,
          expected: schema.pattern,
          received: val
        });
      }
    }
  }

  // 5. Numeric constraints
  if (typeof val === 'number') {
    if (schema.minimum !== undefined && val < schema.minimum) {
      errors.push({
        path,
        message: `Number (${val}) is less than minimum (${schema.minimum})`,
        expected: `>= ${schema.minimum}`,
        received: val
      });
    }
    if (schema.maximum !== undefined && val > schema.maximum) {
      errors.push({
        path,
        message: `Number (${val}) is greater than maximum (${schema.maximum})`,
        expected: `<= ${schema.maximum}`,
        received: val
      });
    }
  }

  // 6. Array constraints
  if (Array.isArray(val)) {
    if (schema.minItems !== undefined && val.length < schema.minItems) {
      errors.push({
        path,
        message: `Array has fewer items (${val.length}) than minItems (${schema.minItems})`,
        expected: `>= ${schema.minItems}`,
        received: val.length
      });
    }
    if (schema.maxItems !== undefined && val.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array has more items (${val.length}) than maxItems (${schema.maxItems})`,
        expected: `<= ${schema.maxItems}`,
        received: val.length
      });
    }
    if (schema.items && !Array.isArray(schema.items)) {
      val.forEach((item, index) => {
        validateNode(item, schema.items as JSONSchema, `${path}[${index}]`, errors, visited, depth + 1);
      });
    }
  }

  // 7. Object constraints
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    const properties = schema.properties || {};
    const required = Array.isArray(schema.required) ? schema.required : [];

    // Check required fields
    for (const reqKey of required) {
      if (!(reqKey in obj) || obj[reqKey] === undefined) {
        errors.push({
          path: path ? `${path}.${reqKey}` : reqKey,
          message: `Missing required property "${reqKey}"`,
          expected: 'present',
          received: 'undefined'
        });
      }
    }

    // Check additionalProperties
    if (schema.additionalProperties === false) {
      const allowedKeys = new Set(Object.keys(properties));
      for (const actualKey of Object.keys(obj)) {
        if (!allowedKeys.has(actualKey)) {
          errors.push({
            path: path ? `${path}.${actualKey}` : actualKey,
            message: `Unexpected property "${actualKey}" not allowed when additionalProperties is false`,
            expected: 'none',
            received: actualKey
          });
        }
      }
    }

    // Recursively check properties
    for (const [key, propVal] of Object.entries(obj)) {
      const propSchema = properties[key];
      if (propSchema) {
        validateNode(propVal, propSchema, path ? `${path}.${key}` : key, errors, visited, depth + 1);
      }
    }
  }
}

function getActualType(val: unknown): string {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}
