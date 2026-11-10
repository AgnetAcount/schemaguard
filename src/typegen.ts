/**
 * schemaguard — Automated TypeScript Type Definition Generator
 * Agnet Software Corp.
 */

import { JSONSchema, UniversalTool } from './types.js';
import { normalizeToUniversal } from './converter.js';

export interface TypegenOptions {
  interfaceName?: string;
  exportKeyword?: boolean;
}

/**
 * Generate TypeScript interface declaration from tool schema.
 */
export function generateTypeScriptTypes(
  toolInput: unknown,
  options: TypegenOptions = {}
): string {
  const tool: UniversalTool = normalizeToUniversal(toolInput);
  const interfaceName = options.interfaceName || toPascalCase(tool.name) + 'Params';
  const shouldExport = options.exportKeyword !== false;

  const lines: string[] = [];
  lines.push('/**');
  lines.push(` * ${tool.description || 'Parameters for ' + tool.name}`);
  lines.push(' * Generated automatically by schemaguard (Agnet Software Corp.)');
  lines.push(' */');

  const exportPrefix = shouldExport ? 'export ' : '';
  lines.push(`${exportPrefix}interface ${interfaceName} {`);

  const params = tool.parameters;
  const properties = params.properties || {};
  const required = new Set(Array.isArray(params.required) ? params.required : []);

  for (const [propName, propSchema] of Object.entries(properties)) {
    const isRequired = required.has(propName);
    const optionalMarker = isRequired ? '' : '?';

    // JSDoc comment for property
    if (propSchema.description || propSchema.default !== undefined || propSchema.minimum !== undefined) {
      lines.push('  /**');
      if (propSchema.description) {
        lines.push(`   * ${propSchema.description}`);
      }
      if (propSchema.default !== undefined) {
        lines.push(`   * @default ${JSON.stringify(propSchema.default)}`);
      }
      if (propSchema.minimum !== undefined || propSchema.maximum !== undefined) {
        lines.push(`   * Range: [${propSchema.minimum ?? '-∞'}, ${propSchema.maximum ?? '+∞'}]`);
      }
      lines.push('   */');
    }

    const typeString = schemaToTsType(propSchema, 2);
    lines.push(`  ${propName}${optionalMarker}: ${typeString};`);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function schemaToTsType(schema: JSONSchema, indentLevel: number): string {
  // Enum
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((e) => JSON.stringify(e)).join(' | ');
  }

  // Const
  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  switch (type) {
    case 'string':
      return 'string';

    case 'number':
    case 'integer':
      return 'number';

    case 'boolean':
      return 'boolean';

    case 'null':
      return 'null';

    case 'array': {
      if (!schema.items || Array.isArray(schema.items)) {
        return 'unknown[]';
      }
      const itemType = schemaToTsType(schema.items, indentLevel);
      if (itemType.includes(' | ') || itemType.startsWith('{')) {
        return `Array<${itemType}>`;
      }
      return `${itemType}[]`;
    }

    case 'object': {
      if (!schema.properties || Object.keys(schema.properties).length === 0) {
        return 'Record<string, unknown>';
      }
      const indent = ' '.repeat(indentLevel);
      const innerIndent = ' '.repeat(indentLevel + 2);
      const subProps = schema.properties;
      const subRequired = new Set(Array.isArray(schema.required) ? schema.required : []);

      const innerLines: string[] = ['{'];
      for (const [subKey, subSchema] of Object.entries(subProps)) {
        const isReq = subRequired.has(subKey);
        const opt = isReq ? '' : '?';
        const subType = schemaToTsType(subSchema, indentLevel + 2);
        innerLines.push(`${innerIndent}${subKey}${opt}: ${subType};`);
      }
      innerLines.push(`${indent}}`);
      return innerLines.join('\n');
    }

    default:
      return 'unknown';
  }
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}
