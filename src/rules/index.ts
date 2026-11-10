/**
 * schemaguard — Validation Rules Registry
 * Agnet Software Corp.
 */

export * from './types.js';
export * from './circular.js';
export * from './mcp.js';
export * from './quality.js';

import { Rule } from './types.js';
import { circularReferenceRule } from './circular.js';
import { mcpToolNameRule, mcpInputSchemaRule, mcpQualityRule } from './mcp.js';
import { descriptionQualityRule, propertyQualityRule } from './quality.js';

export function getAllRules(): Rule[] {
  return [
    circularReferenceRule,
    mcpToolNameRule,
    mcpInputSchemaRule,
    mcpQualityRule,
    descriptionQualityRule,
    propertyQualityRule
  ];
}
