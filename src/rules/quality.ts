/**
 * schemaguard — Description Quality Threshold Rules
 * Agnet Software Corp.
 */

import { Rule, RuleContext } from './types.js';
import { JSONSchema } from '../types.js';

const LOW_QUALITY_PATTERNS = [
  /^todo\b/i,
  /^test\b/i,
  /^placeholder\b/i,
  /^sample\b/i,
  /^description$/i,
  /^my tool$/i,
  /^a tool$/i
];

export const descriptionQualityRule: Rule = {
  id: 'DESCRIPTION_QUALITY',
  name: 'Tool Description Quality Threshold',
  description: 'Audits tool descriptions against length and quality thresholds to ensure optimal LLM tool selection.',
  run(context: RuleContext): void {
    const desc = (context.tool.description || '').trim();
    const threshold = context.options.descriptionMinLength ?? 15;

    if (!desc) {
      context.report({
        code: 'EMPTY_TOOL_DESCRIPTION',
        message: 'Tool description is completely missing or empty. LLMs cannot reliably determine when to call this tool',
        path: 'description',
        severity: 'error',
        fixSuggestion: 'Add an actionable description explaining the purpose, constraints, and return value'
      });
      return;
    }

    if (desc.length < threshold) {
      context.report({
        code: 'VAGUE_TOOL_DESCRIPTION',
        message: `Tool description "${desc}" is under ${threshold} characters, which degrades model tool-calling accuracy`,
        path: 'description',
        severity: 'warning',
        fixSuggestion: 'Expand description with specific context, prerequisites, and expected outcomes'
      });
      return;
    }

    // Check placeholder / low quality patterns
    if (LOW_QUALITY_PATTERNS.some((pattern) => pattern.test(desc))) {
      context.report({
        code: 'LOW_QUALITY_DESCRIPTION',
        message: `Tool description "${desc}" appears to be a placeholder or low-effort stub.`,
        path: 'description',
        severity: 'warning',
        fixSuggestion: 'Replace placeholder description with production documentation for model tool selection'
      });
    }
  }
};

export const propertyQualityRule: Rule = {
  id: 'PROPERTY_QUALITY',
  name: 'Property Description Quality',
  description: 'Verifies that argument properties include actionable documentation for arguments generation.',
  run(context: RuleContext): void {
    const params = context.tool.parameters;
    if (!params || typeof params !== 'object' || !params.properties) {
      return;
    }

    function auditProperties(props: Record<string, JSONSchema>, currentPath: string, visited: Set<object>): void {
      if (visited.has(props)) return;
      visited.add(props);

      for (const [propName, propSchema] of Object.entries(props)) {
        if (!propSchema || typeof propSchema !== 'object') continue;
        const propPath = `${currentPath}.${propName}`;
        const desc = (propSchema.description || '').trim();

        if (!desc) {
          context.report({
            code: 'MISSING_PROPERTY_DESCRIPTION',
            message: `Property "${propName}" lacks a description. LLMs have high error rates without explicit argument instructions`,
            path: `${propPath}.description`,
            severity: 'warning',
            fixSuggestion: `Add description explaining format, constraints, and intent for "${propName}"`
          });
        } else if (desc.length < 5 || desc.toLowerCase() === propName.toLowerCase()) {
          context.report({
            code: 'LOW_QUALITY_PROPERTY_DESCRIPTION',
            message: `Property "${propName}" description "${desc}" is too short or simply echoes the property name.`,
            path: `${propPath}.description`,
            severity: 'warning',
            fixSuggestion: `Provide explicit semantics, valid examples, or constraints for "${propName}"`
          });
        }

        if (propSchema.properties && typeof propSchema.properties === 'object') {
          auditProperties(propSchema.properties, `${propPath}.properties`, visited);
        }
      }
    }

    auditProperties(params.properties, 'parameters.properties', new Set<object>());
  }
};
