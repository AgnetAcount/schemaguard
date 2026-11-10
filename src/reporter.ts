/**
 * schemaguard — High-Contrast Terminal & CI Reporter
 * Agnet Software Corp.
 */

import { LintResult, RuntimeValidationResult } from './types.js';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  white: '\x1b[37m'
};

export function formatLintResult(result: LintResult, filePath?: string): string {
  const lines: string[] = [];

  lines.push('');
  const statusBadge = result.valid
    ? `${ANSI.bgGreen}${ANSI.bold} PASS ${ANSI.reset}`
    : `${ANSI.bgRed}${ANSI.bold} FAIL ${ANSI.reset}`;

  const scoreColor = result.score >= 90 ? ANSI.green : result.score >= 70 ? ANSI.yellow : ANSI.red;

  lines.push(
    `${statusBadge} ${ANSI.bold}${result.toolName}${ANSI.reset} ${ANSI.dim}(${result.detectedFormat.toUpperCase()} format)${ANSI.reset} — Score: ${scoreColor}${result.score}/100${ANSI.reset}`
  );

  if (filePath) {
    lines.push(`${ANSI.dim}Source: ${filePath}${ANSI.reset}`);
  }
  lines.push('');

  if (result.errors.length > 0) {
    lines.push(`${ANSI.red}${ANSI.bold}Errors (${result.errors.length}):${ANSI.reset}`);
    for (const err of result.errors) {
      lines.push(`  ${ANSI.red}✖ [${err.code}]${ANSI.reset} ${err.message}`);
      if (err.path) lines.push(`    ${ANSI.dim}Path: ${err.path}${ANSI.reset}`);
      if (err.fixSuggestion) lines.push(`    ${ANSI.cyan}💡 Fix: ${err.fixSuggestion}${ANSI.reset}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push(`${ANSI.yellow}${ANSI.bold}Warnings (${result.warnings.length}):${ANSI.reset}`);
    for (const warn of result.warnings) {
      lines.push(`  ${ANSI.yellow}▲ [${warn.code}]${ANSI.reset} ${warn.message}`);
      if (warn.path) lines.push(`    ${ANSI.dim}Path: ${warn.path}${ANSI.reset}`);
      if (warn.fixSuggestion) lines.push(`    ${ANSI.cyan}💡 Fix: ${warn.fixSuggestion}${ANSI.reset}`);
    }
    lines.push('');
  }

  if (result.infos.length > 0) {
    lines.push(`${ANSI.blue}${ANSI.bold}Information (${result.infos.length}):${ANSI.reset}`);
    for (const info of result.infos) {
      lines.push(`  ${ANSI.blue}ℹ [${info.code}]${ANSI.reset} ${info.message}`);
      if (info.path) lines.push(`    ${ANSI.dim}Path: ${info.path}${ANSI.reset}`);
    }
    lines.push('');
  }

  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push(`${ANSI.green}✔ Excellent! Schema follows production-grade LLM standards.${ANSI.reset}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatRuntimeResult(result: RuntimeValidationResult): string {
  const lines: string[] = [];
  lines.push('');

  if (result.valid) {
    lines.push(`${ANSI.bgGreen}${ANSI.bold} VALID PAYLOAD ${ANSI.reset} ${ANSI.green}Runtime arguments adhere strictly to tool schema.${ANSI.reset}`);
  } else {
    lines.push(`${ANSI.bgRed}${ANSI.bold} INVALID PAYLOAD ${ANSI.reset} ${ANSI.red}Runtime arguments failed schema contract:${ANSI.reset}`);
    lines.push('');
    for (const err of result.errors) {
      lines.push(`  ${ANSI.red}✖ ${err.message}${ANSI.reset}`);
      if (err.path) lines.push(`    ${ANSI.dim}Field: ${err.path}${ANSI.reset}`);
      if (err.expected) lines.push(`    ${ANSI.cyan}Expected: ${err.expected}${ANSI.reset}`);
      if (err.received !== undefined) lines.push(`    ${ANSI.yellow}Received: ${JSON.stringify(err.received)}${ANSI.reset}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function formatGitHubAnnotations(result: LintResult, filePath: string): string {
  const lines: string[] = [];

  for (const err of result.errors) {
    lines.push(`::error file=${filePath},title=${err.code}::${err.message}`);
  }
  for (const warn of result.warnings) {
    lines.push(`::warning file=${filePath},title=${warn.code}::${warn.message}`);
  }

  return lines.join('\n');
}
