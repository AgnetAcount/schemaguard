#!/usr/bin/env node
/**
 * schemaguard — Command Line Interface
 * Agnet Software Corp.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { lintTool } from './validator.js';
import { exportTo, normalizeToUniversal } from './converter.js';
import { generateMock, MockMode } from './mockgen.js';
import { generateTypeScriptTypes } from './typegen.js';
import { validateRuntimePayload } from './runtime.js';
import { formatLintResult, formatRuntimeResult, formatGitHubAnnotations } from './reporter.js';
import { ToolFormat } from './types.js';

const VERSION = '0.2.0';

function printHelp(): void {
  console.log(`
\x1b[1m\x1b[36mschemaguard\x1b[0m v${VERSION} — AI Agent Tool Schema Validator & Contract Testing Toolkit
Agnet Software Corp. <https://github.com/AgnetAcount/schemaguard>

\x1b[1mUSAGE:\x1b[0m
  schemaguard <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  \x1b[32mlint\x1b[0m <file>                 Audit and score an AI tool schema (OpenAI, Anthropic, Gemini, MCP)
  \x1b[32mconvert\x1b[0m <file> --to <format>  Convert tool schema between providers (openai, anthropic, gemini, mcp)
  \x1b[32mmock\x1b[0m <file>                 Generate synthetic test arguments for unit testing
  \x1b[32mtypegen\x1b[0m <file>              Generate TypeScript types and interfaces with JSDoc
  \x1b[32mvalidate\x1b[0m <schema> <payload>  Validate runtime LLM arguments against a tool schema
  \x1b[32minit\x1b[0m                        Create starter tool definitions for popular providers

\x1b[1mOPTIONS:\x1b[0m
  --to <format>           Target format: openai, anthropic, gemini, mcp, raw
  --mode <mode>           Mock mode: happy (default), minimal, edge
  --strict                Enforce Structured Outputs strict mode rules
  --out <file>            Output destination path (defaults to stdout)
  --json                  Output results in raw JSON format
  --ci                    Emit GitHub Actions workflow annotations
  -v, --version           Show version
  -h, --help              Show this help message

\x1b[1mEXAMPLES:\x1b[0m
  schemaguard lint ./tools/search.json
  schemaguard lint ./tools/search.json --strict --ci
  schemaguard convert ./tools/openai_search.json --to anthropic
  schemaguard mock ./tools/search.json --mode edge
  schemaguard typegen ./tools/search.json --out ./src/types/search.ts
  schemaguard validate ./tools/search.json ./mock_call.json
`);
}

function readJsonFile(filePath: string): unknown {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`\x1b[31mError: File not found: ${fullPath}\x1b[0m`);
    process.exit(1);
  }
  const raw = fs.readFileSync(fullPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`\x1b[31mError parsing JSON from ${fullPath}: ${(err as Error).message}\x1b[0m`);
    process.exit(1);
  }
}

function writeOutput(data: string, outPath?: string): void {
  if (outPath) {
    const fullOut = path.resolve(process.cwd(), outPath);
    const dir = path.dirname(fullOut);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullOut, data, 'utf8');
    console.log(`\x1b[32m✔ File saved to ${outPath}\x1b[0m`);
  } else {
    console.log(data);
  }
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(`schemaguard v${VERSION}`);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'lint': {
      const file = args[1];
      if (!file || file.startsWith('-')) {
        console.error('\x1b[31mError: Missing file argument for lint command\x1b[0m');
        process.exit(1);
      }
      const isStrict = args.includes('--strict');
      const isJson = args.includes('--json');
      const isCi = args.includes('--ci');

      const data = readJsonFile(file);
      const result = lintTool(data, { strictMode: isStrict });

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatLintResult(result, file));
        if (isCi) {
          console.log(formatGitHubAnnotations(result, file));
        }
      }

      process.exit(result.valid ? 0 : 1);
      break;
    }

    case 'convert': {
      const file = args[1];
      if (!file || file.startsWith('-')) {
        console.error('\x1b[31mError: Missing file argument for convert command\x1b[0m');
        process.exit(1);
      }
      const toIndex = args.indexOf('--to');
      if (toIndex === -1 || !args[toIndex + 1]) {
        console.error('\x1b[31mError: Missing required --to <format> (openai, anthropic, gemini, mcp)\x1b[0m');
        process.exit(1);
      }
      const targetFormat = args[toIndex + 1]?.toLowerCase() as ToolFormat;
      const isStrict = args.includes('--strict');
      const outIndex = args.indexOf('--out');
      const outPath = outIndex !== -1 ? args[outIndex + 1] : undefined;

      const data = readJsonFile(file);
      const universal = normalizeToUniversal(data);
      const converted = exportTo(universal, targetFormat, { strict: isStrict, asArray: true });

      writeOutput(JSON.stringify(converted, null, 2), outPath);
      break;
    }

    case 'mock': {
      const file = args[1];
      if (!file || file.startsWith('-')) {
        console.error('\x1b[31mError: Missing file argument for mock command\x1b[0m');
        process.exit(1);
      }
      const modeIndex = args.indexOf('--mode');
      const mode = (modeIndex !== -1 ? args[modeIndex + 1]?.toLowerCase() : 'happy') as MockMode;
      const outIndex = args.indexOf('--out');
      const outPath = outIndex !== -1 ? args[outIndex + 1] : undefined;

      const data = readJsonFile(file);
      const mockPayload = generateMock(data, { mode });

      writeOutput(JSON.stringify(mockPayload, null, 2), outPath);
      break;
    }

    case 'typegen': {
      const file = args[1];
      if (!file || file.startsWith('-')) {
        console.error('\x1b[31mError: Missing file argument for typegen command\x1b[0m');
        process.exit(1);
      }
      const interfaceIndex = args.indexOf('--interface');
      const interfaceName = interfaceIndex !== -1 ? args[interfaceIndex + 1] : undefined;
      const outIndex = args.indexOf('--out');
      const outPath = outIndex !== -1 ? args[outIndex + 1] : undefined;

      const data = readJsonFile(file);
      const code = generateTypeScriptTypes(data, { interfaceName });

      writeOutput(code, outPath);
      break;
    }

    case 'validate': {
      const schemaFile = args[1];
      const payloadFile = args[2];
      if (!schemaFile || !payloadFile) {
        console.error('\x1b[31mError: validate requires both <schema-file> and <payload-file>\x1b[0m');
        process.exit(1);
      }

      const schemaData = readJsonFile(schemaFile);
      const payloadData = readJsonFile(payloadFile);

      const result = validateRuntimePayload(schemaData, payloadData);
      console.log(formatRuntimeResult(result));

      process.exit(result.valid ? 0 : 1);
      break;
    }

    case 'init': {
      const outIndex = args.indexOf('--out');
      const outPath = outIndex !== -1 ? args[outIndex + 1] : './tool.json';

      const template = {
        type: 'function',
        function: {
          name: 'get_weather_forecast',
          description: 'Retrieve real-time weather conditions and forecast for a given geographic location.',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'City and state/country, e.g. "San Francisco, CA" or "Tokyo, Japan"'
              },
              days: {
                type: 'integer',
                minimum: 1,
                maximum: 7,
                default: 3,
                description: 'Number of forecast days requested (1 to 7)'
              },
              units: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                default: 'celsius',
                description: 'Temperature measurement units'
              }
            },
            required: ['location']
          }
        }
      };

      writeOutput(JSON.stringify(template, null, 2), outPath);
      break;
    }

    default:
      console.error(`\x1b[31mUnknown command: "${command}". Run schemaguard --help for options.\x1b[0m`);
      process.exit(1);
  }
}

run();
