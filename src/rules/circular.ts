/**
 * schemaguard — Circular Reference Prevention Rule
 * Agnet Software Corp.
 */

import { Rule, RuleContext } from './types.js';

/**
 * Detect if an object contains circular/cyclical references.
 * Returns the path of the first circular reference detected, or null if acyclic.
 */
export function findCircularPath(root: unknown): string | null {
  if (!root || typeof root !== 'object') {
    return null;
  }

  const stack = new Set<object>();

  function dfs(curr: unknown, path: string): string | null {
    if (!curr || typeof curr !== 'object') {
      return null;
    }

    const obj = curr as object;
    if (stack.has(obj)) {
      return path || 'root';
    }

    stack.add(obj);

    try {
      if (Array.isArray(curr)) {
        for (let i = 0; i < curr.length; i++) {
          const itemPath = path ? `${path}[${i}]` : `[${i}]`;
          const found = dfs(curr[i], itemPath);
          if (found) return found;
        }
      } else {
        for (const [key, val] of Object.entries(curr)) {
          const childPath = path ? `${path}.${key}` : key;
          const found = dfs(val, childPath);
          if (found) return found;
        }
      }
    } finally {
      stack.delete(obj);
    }

    return null;
  }

  return dfs(root, '');
}

/**
 * Helper to check whether any object graph has circular references.
 */
export function detectCircularReferences(schema: unknown): boolean {
  return findCircularPath(schema) !== null;
}

export const circularReferenceRule: Rule = {
  id: 'CIRCULAR_REFERENCE',
  name: 'Circular Reference Prevention',
  description: 'Prevents recursive or cyclical schema structures which crash LLM tool-calling parsers and cause stack overflows.',
  run(context: RuleContext): void {
    if (context.options.checkCircular === false) {
      return;
    }

    // Check raw input first
    const rawCycle = findCircularPath(context.rawInput);
    if (rawCycle) {
      context.report({
        code: 'CIRCULAR_REFERENCE',
        message: `Circular reference detected at "${rawCycle}". Schema must be a finite tree without cycles.`,
        path: rawCycle,
        severity: 'error',
        fixSuggestion: 'Remove cyclical node references and define finite tree schemas for AI tool calling'
      });
      return;
    }

    // Check parameters schema
    const paramCycle = findCircularPath(context.tool.parameters);
    if (paramCycle) {
      const fullPath = `parameters.${paramCycle}`;
      context.report({
        code: 'CIRCULAR_REFERENCE',
        message: `Circular reference detected in schema definition at "${fullPath}".`,
        path: fullPath,
        severity: 'error',
        fixSuggestion: 'Inline finite schemas; recursive references are unsupported in tool calling'
      });
    }
  }
};
