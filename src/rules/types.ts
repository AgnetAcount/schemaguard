/**
 * schemaguard — Validation Rules Type Definitions
 * Agnet Software Corp.
 */

import {
  Diagnostic,
  ToolFormat,
  UniversalTool
} from '../types.js';
import type { LintOptions } from '../linter.js';

export interface RuleContext {
  tool: UniversalTool;
  rawInput: unknown;
  format: ToolFormat;
  options: LintOptions;
  diagnostics: Diagnostic[];
  report(diagnostic: Diagnostic): void;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  run(context: RuleContext): void;
}
